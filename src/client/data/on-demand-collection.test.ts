import { and, createLiveQueryCollection, eq, gte, gt, IR, lt } from "@tanstack/db"
import { QueryClient } from "@tanstack/react-query"
import { afterEach, describe, expect, test } from "vitest"
import { buildOnDemandCollection } from "@/data/collection-factory"
import { toOnDemandQueries, UnsupportedLiveQueryError } from "@/data/on-demand-query"
import type { OnDemandQuery } from "@shared/finances/schemas"

type Check = { id: string; walletId: string; date: string; amountCents: number }

const WALLET = "0190f5d2-0000-7000-8000-000000000001"
const OTHER = "0190f5d2-0000-7000-8000-000000000002"

function stored(n: number, walletId: string, date: string): Check {
  return {
    id: `0190f5d2-0000-7000-8000-1000000000${String(n).padStart(2, "0")}`,
    walletId,
    date,
    amountCents: n,
  }
}

const STORED: Check[] = [
  stored(1, WALLET, "2026-01-05"),
  stored(2, WALLET, "2026-02-05"),
  stored(3, WALLET, "2026-03-05"),
  stored(4, WALLET, "2026-04-05"),
  stored(5, OTHER, "2026-04-05"),
]

/** Answers like the server: the fixed filters, ordered by date. */
function serve(query: OnDemandQuery): Check[] {
  const rows = STORED.filter(
    (row) =>
      (query.walletId === undefined || row.walletId === query.walletId) &&
      (query.dateFrom === undefined || row.date >= query.dateFrom) &&
      (query.dateTo === undefined || row.date <= query.dateTo),
  ).toSorted((a, b) => a.date.localeCompare(b.date))
  if (query.order === "dateDesc") rows.reverse()
  return rows.slice(0, query.limit)
}

const NEWEST_FIRST = { direction: "desc", stringSort: "lexical" } as const

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  // Live queries first, then the collection they read.
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup()
})

function setup() {
  const asked: OnDemandQuery[] = []
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const checks = buildOnDemandCollection<Check>(
    {
      id: `test-checks-${Math.random()}`,
      queryKey: ["test", "checks"],
      fetchRows: async (query) => {
        asked.push(query)
        return serve(query)
      },
      create: async (row) => row,
      update: async () => {
        throw new Error("not used")
      },
      remove: async () => {
        throw new Error("not used")
      },
    },
    client,
  )
  cleanups.push(() => checks.cleanup())
  return { asked, checks }
}

describe("an on-demand collection", () => {
  test("loads nothing until a live query asks", async () => {
    const { asked, checks } = setup()
    await checks.preload()
    expect(asked).toEqual([])
  })

  test("loads a page for a live query's where, order and limit, never every row", async () => {
    const { asked, checks } = setup()
    const latest = createLiveQueryCollection((q) =>
      q
        .from({ check: checks })
        .where(({ check }) => and(eq(check.walletId, WALLET), gte(check.date, "2026-02-01")))
        .orderBy(({ check }) => check.date, NEWEST_FIRST)
        .limit(2),
    )
    cleanups.push(() => latest.cleanup())
    await latest.preload()

    expect(asked).toEqual([
      { walletId: WALLET, dateFrom: "2026-02-01", order: "dateDesc", limit: 2 },
      // TanStack DB then makes sure no other row shares the page's last date.
      { walletId: WALLET, dateFrom: "2026-03-05", dateTo: "2026-03-05" },
    ])
    expect(latest.toArray.map((row) => row.date)).toEqual(["2026-04-05", "2026-03-05"])
  })

  test("a strict date bound becomes the inclusive day beyond it", async () => {
    const { asked, checks } = setup()
    const before = createLiveQueryCollection((q) =>
      q
        .from({ check: checks })
        .where(({ check }) => and(eq(check.walletId, WALLET), lt(check.date, "2026-03-05")))
        .orderBy(({ check }) => check.date, NEWEST_FIRST)
        .limit(1),
    )
    cleanups.push(() => before.cleanup())
    await before.preload()

    expect(asked[0]).toEqual({
      walletId: WALLET,
      dateTo: "2026-03-04",
      order: "dateDesc",
      limit: 1,
    })
    expect(before.toArray.map((row) => row.date)).toEqual(["2026-02-05"])
  })

  test("refuses a locale-sorted date order, which cannot be paged", async () => {
    const { checks } = setup()
    const sorted = createLiveQueryCollection((q) =>
      q
        .from({ check: checks })
        .orderBy(({ check }) => check.date, "desc")
        .limit(1),
    )
    cleanups.push(() => sorted.cleanup())
    await expect(sorted.preload()).rejects.toThrow(UnsupportedLiveQueryError)
  })

  test("refuses a live query the server's filters cannot express", async () => {
    const { checks } = setup()
    const big = createLiveQueryCollection((q) =>
      q.from({ check: checks }).where(({ check }) => gt(check.amountCents, 100)),
    )
    cleanups.push(() => big.cleanup())
    await expect(big.preload()).rejects.toThrow(UnsupportedLiveQueryError)
  })
})

const ref = (name: string) => new IR.PropRef([name])
const val = (value: unknown) => new IR.Value(value)
const func = (name: string, ...args: IR.BasicExpression[]) => new IR.Func(name, args)
const byDate = (direction: "asc" | "desc"): IR.OrderBy => [
  {
    expression: ref("date"),
    compareOptions: { direction, nulls: "last", stringSort: "lexical" },
  },
]

describe("toOnDemandQueries", () => {
  test("maps every filter in the fixed set", () => {
    const where = func(
      "and",
      func("eq", ref("walletId"), val(WALLET)),
      func("isNull", ref("categoryId")),
      func("eq", ref("status"), val("actual")),
      func("isNull", ref("reviewedAt")),
      func("eq", ref("ignored"), val(true)),
      func("in", ref("id"), val([WALLET, OTHER])),
      func("gt", ref("date"), val("2026-01-31")),
      func("lte", ref("date"), val("2026-02-28")),
    )
    expect(toOnDemandQueries({ where, orderBy: byDate("asc"), limit: 50 })).toEqual([
      {
        walletId: WALLET,
        categoryId: null,
        status: "actual",
        unreviewed: true,
        includeIgnored: true,
        ids: [WALLET, OTHER],
        dateFrom: "2026-02-01",
        dateTo: "2026-02-28",
        order: "dateAsc",
        limit: 50,
      },
    ])
  })

  test("a Transfer out of or into one Wallet asks for that Wallet's Transfers", () => {
    const either = (wallet: string, other = wallet) =>
      func(
        "or",
        func("eq", ref("fromWalletId"), val(wallet)),
        func("eq", ref("toWalletId"), val(other)),
      )
    expect(toOnDemandQueries({ where: either(WALLET) })).toEqual([{ walletId: WALLET }])
    expect(
      toOnDemandQueries({
        where: func("and", either(WALLET), func("eq", ref("status"), val("planned"))),
      }),
    ).toEqual([{ walletId: WALLET, status: "planned" }])
    // Two different Wallets, or one side alone, is more than the filter can say.
    for (const where of [either(WALLET, OTHER), func("eq", ref("fromWalletId"), val(WALLET))]) {
      expect(() => toOnDemandQueries({ where })).toThrow(UnsupportedLiveQueryError)
    }
  })

  test("left-out ignored rows need no filter; the server leaves them out", () => {
    const where = func("eq", ref("ignored"), val(false))
    expect(toOnDemandQueries({ where })).toEqual([{}])
  })

  test("paging on from a cursor loads the cursor's whole date, then a page beyond it", () => {
    const where = func("eq", ref("walletId"), val(WALLET))
    const cursor = {
      whereFrom: func("lt", ref("date"), val("2026-03-05")),
      whereCurrent: func("eq", ref("date"), val("2026-03-05")),
    }
    expect(toOnDemandQueries({ where, orderBy: byDate("desc"), limit: 10, cursor })).toEqual([
      { walletId: WALLET, order: "dateDesc", dateFrom: "2026-03-05", dateTo: "2026-03-05" },
      { walletId: WALLET, order: "dateDesc", dateTo: "2026-03-04", limit: 10 },
    ])
  })

  test("a range that cannot match asks the server nothing", () => {
    const where = func(
      "and",
      func("gte", ref("date"), val("2026-03-01")),
      func("lt", ref("date"), val("2026-03-01")),
    )
    expect(toOnDemandQueries({ where })).toEqual([])
  })

  test("refuses orders, offsets and operators outside the fixed set", () => {
    const byAmount: IR.OrderBy = [
      {
        expression: ref("amountCents"),
        compareOptions: { direction: "asc", nulls: "last" },
      },
    ]
    for (const options of [
      { orderBy: byAmount },
      { orderBy: byDate("asc"), offset: 20 },
      { where: func("or", func("eq", ref("walletId"), val(WALLET)), func("isNull", ref("date"))) },
      { where: func("like", ref("note"), val("%rent%")) },
      { where: func("isNull", ref("date")) },
      {
        where: func(
          "and",
          func("eq", ref("categoryId"), val(WALLET)),
          func("isNull", ref("categoryId")),
        ),
      },
    ]) {
      expect(() => toOnDemandQueries(options), JSON.stringify(options)).toThrow(
        UnsupportedLiveQueryError,
      )
    }
  })
})

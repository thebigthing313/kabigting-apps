// "Show older" on a Wallet's tabs, through the real hooks and collections, against a fake server
// that answers `POST /query` the way the real one does.
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import {
  type BalanceCheck,
  useBalanceChecks,
  useLatestBalanceCheck,
} from "@/data/finances-balance-checks"
import { type Transaction, useActivity, useActualsSince } from "@/data/finances-transactions"
import { addDays } from "@shared/dates"
import { balanceCheckQuery, type OnDemandQuery, transactionQuery } from "@shared/finances/schemas"

const WALLET = "0190f5d2-0000-7000-8000-000000000001"
const STAMP = "2026-10-01T12:00:00.000Z"

function idOf(n: number): string {
  return `0190f5d2-0000-7000-8000-${String(n).padStart(12, "0")}`
}

/** 300 Actuals, three a day, the newest on 2026-10-17. */
const ACTUALS: Transaction[] = Array.from({ length: 300 }, (_, n) => ({
  id: idOf(n),
  status: "actual",
  walletId: WALLET,
  date: addDays("2026-10-17", -Math.floor((299 - n) / 3)),
  amountCents: -100 - n,
  accountId: null,
  categoryId: null,
  note: "",
  bankDescription: null,
  source: "manual",
  ignored: false,
  reviewedAt: null,
  reconciledActualId: null,
  createdAt: STAMP,
  updatedAt: STAMP,
}))

/** 100 Balance checks, one every other day, the newest on 2026-10-05. */
const CHECKS: BalanceCheck[] = Array.from({ length: 100 }, (_, n) => ({
  id: idOf(1000 + n),
  walletId: WALLET,
  date: addDays("2026-10-05", -2 * (99 - n)),
  amountCents: 10_000 + n,
  createdAt: STAMP,
  updatedAt: STAMP,
}))

const LAST_CHECK = "2026-10-05"

function newestFirst(rows: readonly { id: string; date: string }[]): string[] {
  return rows
    .toSorted((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map((row) => row.id)
}

/** Answers like the server: the fixed filters, by date then id. */
function serve<Row extends { id: string; date: string; walletId: string; status?: string }>(
  stored: readonly Row[],
  query: OnDemandQuery,
): Row[] {
  const rows = stored
    .filter(
      (row) =>
        (query.walletId === undefined || row.walletId === query.walletId) &&
        (query.status === undefined || row.status === query.status) &&
        (query.dateFrom === undefined || row.date >= query.dateFrom) &&
        (query.dateTo === undefined || row.date <= query.dateTo) &&
        (query.ids === undefined || query.ids.includes(row.id)),
    )
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  if (query.order === "dateDesc") rows.reverse()
  return query.limit === undefined ? rows : rows.slice(0, query.limit)
}

// Each test reads its own collection, so none starts with another's rows and none needs clearing.
const ROUTES = {
  "/api/finances/transactions/query": (body: unknown) => {
    const query = transactionQuery.parse(body)
    return { query, rows: serve(ACTUALS, query) }
  },
  "/api/finances/balance-checks/query": (body: unknown) => {
    const query = balanceCheckQuery.parse(body)
    return { query, rows: serve(CHECKS, query) }
  },
}

let asked: { path: string; query: OnDemandQuery }[] = []

beforeEach(() => {
  asked = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(input instanceof Request ? input.url : String(input), location.origin)
      .pathname
    const route = Object.entries(ROUTES).find(([known]) => known === path)?.[1]
    if (!route) return Response.json({ rows: [] })
    const body = input instanceof Request ? await input.text() : init?.body
    const { query, rows } = route(typeof body === "string" ? JSON.parse(body) : null)
    asked.push({ path, query })
    // A real round trip: the page grows while a load is still on its way.
    await new Promise((resolve) => setTimeout(resolve, 100))
    return Response.json({ rows })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function Shown({ ids, onOlder }: { ids: readonly string[]; onOlder: () => void }) {
  return (
    <>
      <ol>
        {ids.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ol>
      <button type="button" onClick={onOlder}>
        Show older
      </button>
    </>
  )
}

/** What the Activity tab reads: a page of Actuals, beside the balance's since its last check. */
function ActivityHarness() {
  const { data, fetchNextPage } = useActivity(WALLET, 25)
  useActualsSince(WALLET, LAST_CHECK)
  return <Shown ids={data.map((row) => row.id)} onOlder={() => void fetchNextPage()} />
}

/** What the Balance checks tab reads: a page of checks, beside the balance's latest one. */
function ChecksHarness() {
  const { data, fetchNextPage } = useBalanceChecks(WALLET, 20)
  useLatestBalanceCheck(WALLET)
  return <Shown ids={data.map((row) => row.id)} onOlder={() => void fetchNextPage()} />
}

async function pagesFollowOn(harness: React.ReactNode, expected: string[], pageSize: number) {
  const screen = await render(harness)
  const shown = () =>
    screen
      .getByRole("listitem")
      .elements()
      .map((item) => item.textContent)
  for (const pages of [1, 2, 3, 4]) {
    if (pages > 1) await screen.getByRole("button", { name: "Show older" }).click()
    await expect.poll(shown).toEqual(expected.slice(0, pages * pageSize))
  }
}

test("each page of older Actuals follows on from the last, loading only that page", async () => {
  await pagesFollowOn(<ActivityHarness />, newestFirst(ACTUALS), 25)
  // Only the balance's Actuals since its check load without a limit.
  const unbounded = asked.filter(
    ({ query }) => query.limit === undefined && query.dateFrom === undefined,
  )
  expect(unbounded).toEqual([])
})

test("each page of older Balance checks follows on from the last, loading only that page", async () => {
  await pagesFollowOn(<ChecksHarness />, newestFirst(CHECKS), 20)
  const unbounded = asked.filter(
    ({ query }) => query.limit === undefined && query.dateFrom === undefined,
  )
  expect(unbounded).toEqual([])
})

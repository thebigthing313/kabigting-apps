import { describe, expect, test } from "vitest"
import {
  findHandEntryTwin,
  type PlannedItem,
  outstandingPlanned,
  reconcilableTo,
  reviewSuggestion,
  suggestMatches,
} from "./reconcile.ts"

const CHECKING = "wallet-checking"
const CARD = "wallet-card"

/** A made-up one-off Planned on Checking; tests change only what they are about. */
type OneOff = Exclude<PlannedItem, { kind: "occurrence" }>

function planned(id: string, changes: Partial<OneOff> = {}): OneOff {
  return {
    kind: "transaction",
    id,
    walletId: CHECKING,
    date: "2026-03-10",
    amountCents: -5_000,
    accountId: null,
    categoryId: null,
    between: null,
    ...changes,
  }
}

const ACTUAL = { walletId: CHECKING, date: "2026-03-10", amountCents: -5_000 }

function ids(items: readonly PlannedItem[]) {
  return items.map((item) => (item.kind === "occurrence" ? item.nominalDate : item.id))
}

describe("suggestMatches", () => {
  test("keeps only the same Wallet, the same sign and within 7 days either side", () => {
    const candidates = [
      planned("same"),
      planned("other-wallet", { walletId: CARD }),
      planned("money-in", { amountCents: 5_000 }),
      planned("seven-before", { date: "2026-03-03" }),
      planned("eight-before", { date: "2026-03-02" }),
      planned("seven-after", { date: "2026-03-17" }),
      planned("eight-after", { date: "2026-03-18" }),
    ]
    expect(ids(suggestMatches(ACTUAL, candidates)).toSorted()).toEqual(
      ["same", "seven-after", "seven-before"].toSorted(),
    )
  })

  test("ranks by closeness of amount, then of date", () => {
    const candidates = [
      planned("far-amount", { amountCents: -9_000 }),
      planned("near-amount-late", { amountCents: -5_100, date: "2026-03-15" }),
      planned("near-amount-soon", { amountCents: -4_900, date: "2026-03-09" }),
      planned("exact-a-week-off", { amountCents: -5_000, date: "2026-03-17" }),
    ]
    expect(ids(suggestMatches(ACTUAL, candidates))).toEqual([
      "exact-a-week-off",
      "near-amount-soon",
      "near-amount-late",
      "far-amount",
    ])
  })

  test("money in matches money in", () => {
    const income = { walletId: CHECKING, date: "2026-03-10", amountCents: 200_000 }
    const candidates = [planned("pay", { amountCents: 190_000 }), planned("bill")]
    expect(ids(suggestMatches(income, candidates))).toEqual(["pay"])
  })

  test("nothing outstanding suggests nothing", () => {
    expect(suggestMatches(ACTUAL, [])).toEqual([])
  })
})

describe("outstandingPlanned", () => {
  const rent = {
    id: "schedule-rent",
    walletId: CHECKING,
    toWalletId: null,
    accountId: "account-landlord",
    categoryId: "category-housing",
    unit: "month" as const,
    every: 1,
    startDate: "2026-01-01",
    endDate: null,
    amountCents: -150_000,
  }
  const range = { from: "2026-02-01", to: "2026-04-30" }

  test("lists a Wallet's outstanding Occurrences and one-offs in the range, by date", () => {
    const items = outstandingPlanned({
      walletId: CHECKING,
      schedules: [rent],
      occurrences: [
        {
          scheduleId: rent.id,
          nominalDate: "2026-03-01",
          overrideAmountCents: -155_000,
          overrideDate: null,
          skipped: false,
          reconciledTransactionId: null,
          reconciledTransferId: null,
        },
        {
          scheduleId: rent.id,
          nominalDate: "2026-04-01",
          overrideAmountCents: null,
          overrideDate: null,
          skipped: true,
          reconciledTransactionId: null,
          reconciledTransferId: null,
        },
      ],
      planned: [
        { ...planned("repair", { date: "2026-03-05" }), reconciledActualId: null },
        { ...planned("done", { date: "2026-03-06" }), reconciledActualId: "actual-1" },
        { ...planned("card", { walletId: CARD }), reconciledActualId: null },
        { ...planned("too-late", { date: "2026-05-01" }), reconciledActualId: null },
      ],
      range,
    })
    expect(items).toEqual([
      {
        kind: "occurrence",
        scheduleId: rent.id,
        nominalDate: "2026-02-01",
        walletId: CHECKING,
        date: "2026-02-01",
        amountCents: -150_000,
        accountId: "account-landlord",
        categoryId: "category-housing",
        between: null,
      },
      {
        kind: "occurrence",
        scheduleId: rent.id,
        nominalDate: "2026-03-01",
        walletId: CHECKING,
        date: "2026-03-01",
        amountCents: -155_000,
        accountId: "account-landlord",
        categoryId: "category-housing",
        between: null,
      },
      expect.objectContaining({ kind: "transaction", id: "repair", date: "2026-03-05" }),
    ])
  })

  test("leaves out Reconciled Occurrences and other Wallets' Schedules", () => {
    const items = outstandingPlanned({
      walletId: CHECKING,
      schedules: [rent, { ...rent, id: "schedule-card", walletId: CARD }],
      occurrences: [
        {
          scheduleId: rent.id,
          nominalDate: "2026-02-01",
          overrideAmountCents: null,
          overrideDate: null,
          skipped: false,
          reconciledTransactionId: "actual-1",
          reconciledTransferId: null,
        },
      ],
      planned: [],
      range,
    })
    expect(items.map((item) => item.date)).toEqual(["2026-03-01", "2026-04-01"])
  })

  test("lists Planned Transfers into and out of the Wallet, signed as they move it", () => {
    const payment = {
      ...rent,
      id: "schedule-payment",
      toWalletId: CARD,
      categoryId: null,
      amountCents: 20_000,
      startDate: "2026-03-20",
      endDate: "2026-03-20",
    }
    const oneOff = {
      id: "refund-to-checking",
      fromWalletId: CARD,
      toWalletId: CHECKING,
      date: "2026-03-25",
      amountCents: 3_000,
      accountId: null,
      reconciledActualId: null,
    }
    const done = { ...oneOff, id: "done", reconciledActualId: "transfer-1" }
    const input = { schedules: [payment], occurrences: [], planned: [], range }
    const onChecking = outstandingPlanned({
      ...input,
      walletId: CHECKING,
      plannedTransfers: [oneOff, done],
    })
    expect(onChecking.map((item) => [item.kind, item.amountCents, item.between])).toEqual([
      ["occurrence", -20_000, { fromWalletId: CHECKING, toWalletId: CARD }],
      ["transfer", 3_000, { fromWalletId: CARD, toWalletId: CHECKING }],
    ])
    const onCard = outstandingPlanned({ ...input, walletId: CARD, plannedTransfers: [oneOff] })
    expect(onCard.map((item) => item.amountCents)).toEqual([20_000, -3_000])
    const elsewhere = outstandingPlanned({
      ...input,
      walletId: "wallet-other",
      plannedTransfers: [oneOff],
    })
    expect(elsewhere).toEqual([])
  })
})

describe("reconcilableTo", () => {
  const toCard = { fromWalletId: CHECKING, toWalletId: CARD }
  const items = [
    planned("bill"),
    planned("payment", { kind: "transfer", between: toCard }),
    planned("refund", { kind: "transfer", between: { fromWalletId: CARD, toWalletId: CHECKING } }),
  ]

  test("an Actual Transaction can take any of them", () => {
    expect(ids(reconcilableTo({ between: null }, items))).toEqual(["bill", "payment", "refund"])
  })

  test("an Actual Transfer takes only a Planned Transfer between the same Wallets, the same way", () => {
    expect(ids(reconcilableTo({ between: toCard }, items))).toEqual(["payment"])
  })
})

/** A made-up Actual on Checking; tests change only what they are about. */
function actual(
  id: string,
  changes: Partial<{
    walletId: string
    date: string
    amountCents: number
    source: "manual" | "ofx" | "access" | null
    status: "planned" | "actual"
    ignored: boolean
  }> = {},
) {
  return {
    id,
    walletId: CHECKING,
    date: "2026-03-10",
    amountCents: -5_000,
    source: "manual" as const,
    status: "actual" as const,
    ignored: false,
    ...changes,
  }
}

const LINE = { walletId: CHECKING, date: "2026-03-10", amountCents: -5_000 }

describe("findHandEntryTwin", () => {
  test("finds a hand-entered Actual in the same Wallet, for the exact amount, within 3 days", () => {
    for (const date of ["2026-03-07", "2026-03-10", "2026-03-13"]) {
      expect(findHandEntryTwin(LINE, [actual("twin", { date })])?.id).toBe("twin")
    }
  })

  test("passes over other Wallets, other amounts, dates further off and keyed rows", () => {
    const others = [
      actual("other-wallet", { walletId: CARD }),
      actual("a-cent-off", { amountCents: -5_001 }),
      actual("four-days-before", { date: "2026-03-06" }),
      actual("four-days-after", { date: "2026-03-14" }),
      actual("uploaded", { source: "ofx" }),
      actual("imported", { source: "access" }),
      actual("planned", { status: "planned", source: null }),
      actual("ignored", { ignored: true }),
    ]
    expect(findHandEntryTwin(LINE, others)).toBeUndefined()
  })

  test("picks the closest date", () => {
    const entries = [actual("far", { date: "2026-03-13" }), actual("near", { date: "2026-03-09" })]
    expect(findHandEntryTwin(LINE, entries)?.id).toBe("near")
  })
})

describe("reviewSuggestion", () => {
  test("a hand-entry twin comes before a Planned match", () => {
    const suggestion = reviewSuggestion(LINE, {
      outstanding: [planned("rent")],
      handEntered: [actual("twin")],
    })
    expect(suggestion).toMatchObject({ kind: "twin", handEntry: { id: "twin" } })
  })

  test("otherwise the best Planned match", () => {
    const suggestion = reviewSuggestion(LINE, {
      outstanding: [planned("far", { amountCents: -9_000 }), planned("best")],
      handEntered: [],
    })
    expect(suggestion).toMatchObject({ kind: "planned", item: { id: "best" } })
  })

  test("nothing when there is neither", () => {
    expect(
      reviewSuggestion(LINE, {
        outstanding: [planned("other-wallet", { walletId: CARD })],
        handEntered: [actual("uploaded", { source: "ofx" })],
      }),
    ).toBeNull()
  })
})

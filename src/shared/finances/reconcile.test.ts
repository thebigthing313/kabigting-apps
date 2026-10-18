import { describe, expect, test } from "vitest"
import { type PlannedItem, outstandingPlanned, suggestMatches } from "./reconcile.ts"

const CHECKING = "wallet-checking"
const CARD = "wallet-card"

/** A made-up one-off Planned on Checking; tests change only what they are about. */
type OneOff = Extract<PlannedItem, { kind: "transaction" }>

function planned(id: string, changes: Partial<OneOff> = {}): OneOff {
  return {
    kind: "transaction",
    id,
    walletId: CHECKING,
    date: "2026-03-10",
    amountCents: -5_000,
    accountId: null,
    categoryId: null,
    ...changes,
  }
}

const ACTUAL = { walletId: CHECKING, date: "2026-03-10", amountCents: -5_000 }

function ids(items: readonly PlannedItem[]) {
  return items.map((item) => (item.kind === "transaction" ? item.id : item.nominalDate))
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
      },
      expect.objectContaining({ kind: "transaction", id: "repair", date: "2026-03-05" }),
    ])
  })

  test("leaves out Reconciled Occurrences, other Wallets' Schedules and Transfer Schedules", () => {
    const items = outstandingPlanned({
      walletId: CHECKING,
      schedules: [
        rent,
        { ...rent, id: "schedule-card", walletId: CARD },
        { ...rent, id: "schedule-payment", toWalletId: CARD, categoryId: null, amountCents: 1 },
      ],
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
})

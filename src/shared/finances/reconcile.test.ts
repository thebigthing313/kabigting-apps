import { describe, expect, test } from "vitest"
import {
  findHandEntryTwin,
  type PlannedItem,
  outstandingPlanned,
  reconcilableTo,
  reviewSuggestion,
  suggestMatches,
  suggestTransferHalf,
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
      transfers: [],
    })
    expect(suggestion).toMatchObject({ kind: "twin", handEntry: { id: "twin" } })
  })

  test("otherwise the best Planned match", () => {
    const suggestion = reviewSuggestion(LINE, {
      outstanding: [planned("far", { amountCents: -9_000 }), planned("best")],
      handEntered: [],
      transfers: [],
    })
    expect(suggestion).toMatchObject({ kind: "planned", item: { id: "best" } })
  })

  test("nothing when there is neither", () => {
    expect(
      reviewSuggestion(LINE, {
        outstanding: [planned("other-wallet", { walletId: CARD })],
        handEntered: [actual("uploaded", { source: "ofx" })],
        transfers: [],
      }),
    ).toBeNull()
  })
})

/** A made-up card payment, from Checking to the card, whose Checking line has arrived. */
function waitingTransfer(
  id: string,
  changes: Partial<{
    status: "planned" | "actual"
    date: string
    amountCents: number
    fromWalletId: string
    toWalletId: string
    fromSource: "manual" | "ofx" | "access" | null
    toSource: "manual" | "ofx" | "access" | null
    ignored: boolean
  }> = {},
) {
  return {
    id,
    status: "actual" as const,
    date: "2026-03-10",
    amountCents: 25_000,
    fromWalletId: CHECKING,
    toWalletId: CARD,
    fromSource: "ofx" as const,
    toSource: null,
    ignored: false,
    ...changes,
  }
}

/** The card's own line for that payment: money into the card. */
const CARD_LINE = { walletId: CARD, date: "2026-03-12", amountCents: 25_000 }

describe("suggestTransferHalf", () => {
  test("finds the Actual Transfer waiting for this Wallet's side, for the amount, within 7 days", () => {
    for (const date of ["2026-03-05", "2026-03-12", "2026-03-19"]) {
      expect(suggestTransferHalf(CARD_LINE, [waitingTransfer("payment", { date })])?.id).toBe(
        "payment",
      )
    }
  })

  test("a line out of the from Wallet is the other half of one whose to side arrived", () => {
    const transfer = waitingTransfer("payment", { fromSource: null, toSource: "ofx" })
    const checkingLine = { walletId: CHECKING, date: "2026-03-10", amountCents: -25_000 }
    expect(suggestTransferHalf(checkingLine, [transfer])?.id).toBe("payment")
  })

  test("passes over other amounts, dates further off, the arrived side's Wallet and the wrong way", () => {
    const others = [
      waitingTransfer("a-cent-off", { amountCents: 25_001 }),
      waitingTransfer("eight-days-before", { date: "2026-03-04" }),
      waitingTransfer("eight-days-after", { date: "2026-03-20" }),
      waitingTransfer("card-side-arrived", { fromSource: null, toSource: "ofx" }),
      waitingTransfer("other-wallets", { fromWalletId: "savings", toWalletId: CHECKING }),
    ]
    expect(suggestTransferHalf(CARD_LINE, others)).toBeUndefined()
    const purchase = { ...CARD_LINE, amountCents: -25_000 }
    expect(suggestTransferHalf(purchase, [waitingTransfer("payment")])).toBeUndefined()
  })

  test("passes over Transfers not waiting: both sides in, Planned or ignored", () => {
    const others = [
      waitingTransfer("both-arrived", { toSource: "ofx" }),
      waitingTransfer("planned", { status: "planned", fromSource: null }),
      waitingTransfer("ignored", { ignored: true }),
    ]
    expect(suggestTransferHalf(CARD_LINE, others)).toBeUndefined()
  })

  test("picks the closest date", () => {
    const transfers = [
      waitingTransfer("far", { date: "2026-03-06" }),
      waitingTransfer("near", { date: "2026-03-11" }),
    ]
    expect(suggestTransferHalf(CARD_LINE, transfers)?.id).toBe("near")
  })
})

/** A made-up card payment entered by hand, from Checking to the card: neither side is keyed. */
function handEnteredTransfer(id: string, changes: Parameters<typeof waitingTransfer>[1] = {}) {
  return waitingTransfer(id, { fromSource: "manual", toSource: "manual", ...changes })
}

describe("suggestTransferHalf with a hand-entered Transfer", () => {
  const CHECKING_LINE = { walletId: CHECKING, date: "2026-03-10", amountCents: -25_000 }

  test("finds it from either Wallet, for the amount, within 3 days", () => {
    for (const date of ["2026-03-09", "2026-03-12", "2026-03-15"]) {
      expect(suggestTransferHalf(CARD_LINE, [handEnteredTransfer("payment", { date })])?.id).toBe(
        "payment",
      )
    }
    for (const date of ["2026-03-07", "2026-03-13"]) {
      expect(
        suggestTransferHalf(CHECKING_LINE, [handEnteredTransfer("payment", { date })])?.id,
      ).toBe("payment")
    }
  })

  test("passes over other amounts, the wrong way, other Wallets and dates further off", () => {
    const others = [
      handEnteredTransfer("a-cent-off", { amountCents: 25_001 }),
      handEnteredTransfer("four-days-before", { date: "2026-03-08" }),
      handEnteredTransfer("four-days-after", { date: "2026-03-16" }),
      handEnteredTransfer("other-wallets", { fromWalletId: "savings", toWalletId: CHECKING }),
      handEnteredTransfer("planned", { status: "planned", fromSource: null, toSource: null }),
      handEnteredTransfer("ignored", { ignored: true }),
    ]
    expect(suggestTransferHalf(CARD_LINE, others)).toBeUndefined()
    const purchase = { ...CARD_LINE, amountCents: -25_000 }
    expect(suggestTransferHalf(purchase, [handEnteredTransfer("payment")])).toBeUndefined()
    const deposit = { ...CHECKING_LINE, amountCents: 25_000 }
    expect(suggestTransferHalf(deposit, [handEnteredTransfer("payment")])).toBeUndefined()
  })

  test("a keyed side is never written over", () => {
    // Its Checking side arrived, so only the card side is open.
    const keyedHere = handEnteredTransfer("payment", { fromSource: "ofx" })
    expect(suggestTransferHalf(CHECKING_LINE, [keyedHere])).toBeUndefined()
    const bothKeyed = handEnteredTransfer("payment", { fromSource: "ofx", toSource: "access" })
    expect(suggestTransferHalf(CARD_LINE, [bothKeyed])).toBeUndefined()
  })

  test("picks the closest date among hand-entered and waiting Transfers", () => {
    const transfers = [
      waitingTransfer("waiting", { date: "2026-03-08" }),
      handEnteredTransfer("by-hand", { date: "2026-03-11" }),
    ]
    expect(suggestTransferHalf(CARD_LINE, transfers)?.id).toBe("by-hand")
  })
})

describe("reviewSuggestion with Transfers", () => {
  test("a hand-entered Transfer comes after a hand-entry twin and before a Planned match", () => {
    const candidates = {
      outstanding: [planned("refund", { walletId: CARD, amountCents: 25_000 })],
      handEntered: [actual("twin", { walletId: CARD, amountCents: 25_000, date: "2026-03-12" })],
      transfers: [handEnteredTransfer("payment")],
    }
    expect(reviewSuggestion(CARD_LINE, candidates)).toMatchObject({ kind: "twin" })
    expect(reviewSuggestion(CARD_LINE, { ...candidates, handEntered: [] })).toMatchObject({
      kind: "transfer",
      transfer: { id: "payment" },
    })
  })

  test("the other side of a waiting Transfer comes before a Planned match", () => {
    const suggestion = reviewSuggestion(CARD_LINE, {
      outstanding: [planned("refund", { walletId: CARD, amountCents: 25_000 })],
      handEntered: [],
      transfers: [waitingTransfer("payment")],
    })
    expect(suggestion).toMatchObject({ kind: "transfer", transfer: { id: "payment" } })
  })

  test("a hand-entry twin still comes first", () => {
    const suggestion = reviewSuggestion(CARD_LINE, {
      outstanding: [],
      handEntered: [actual("twin", { walletId: CARD, amountCents: 25_000, date: "2026-03-12" })],
      transfers: [waitingTransfer("payment")],
    })
    expect(suggestion).toMatchObject({ kind: "twin", handEntry: { id: "twin" } })
  })
})

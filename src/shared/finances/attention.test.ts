import { describe, expect, test } from "vitest"
import { type AttentionInput, walletAttention } from "./attention.ts"
import { type ForecastInput, forecast } from "./forecast.ts"

const CHECKING = "wallet-checking"
const TODAY = "2026-03-10"

/** A made-up Checking Wallet with a $1,000.00 check on Mar 1 and nothing planned. */
function forecastInput(changes: Partial<ForecastInput> = {}): ForecastInput {
  return {
    wallet: { id: CHECKING, lowBalanceThresholdCents: 0 },
    latestCheck: { date: "2026-03-01", amountCents: 100_000 },
    actualsSince: [],
    planned: [],
    plannedTransfers: [],
    schedules: [],
    occurrences: [],
    today: TODAY,
    horizonDays: 30,
    ...changes,
  }
}

/** Checking in the forecast, with its Forecast from `changes` and nothing To review. */
function input(
  changes: Partial<ForecastInput> = {},
  attention: Partial<AttentionInput> = {},
): AttentionInput {
  const forForecast = forecastInput(changes)
  return {
    wallet: { inForecast: true, shownAsOwed: false, ...forForecast.wallet },
    hasBalanceCheck: forForecast.latestCheck !== null,
    toReview: [],
    forecast: forecast(forForecast),
    ...attention,
  }
}

describe("To review", () => {
  test("each uploaded line waiting for a person is an item", () => {
    const items = walletAttention(
      input(
        {},
        {
          toReview: [
            { id: "line-1", date: "2026-03-02", amountCents: -500 },
            { id: "line-2", date: "2026-03-04", amountCents: 1_000 },
          ],
        },
      ),
    )
    expect(items).toEqual([
      { kind: "toReview", walletId: CHECKING, id: "line-1", date: "2026-03-02", amountCents: -500 },
      {
        kind: "toReview",
        walletId: CHECKING,
        id: "line-2",
        date: "2026-03-04",
        amountCents: 1_000,
      },
    ])
  })

  test("a Wallet outside the forecast still lists its lines", () => {
    const items = walletAttention({
      wallet: { id: CHECKING, inForecast: false, shownAsOwed: false, lowBalanceThresholdCents: 0 },
      hasBalanceCheck: false,
      toReview: [{ id: "line-1", date: "2026-03-02", amountCents: -500 }],
      forecast: null,
    })
    expect(items.map((item) => item.kind)).toEqual(["toReview"])
  })
})

describe("Overdue", () => {
  const rent = {
    id: "schedule-rent",
    walletId: CHECKING,
    toWalletId: null,
    unit: "month" as const,
    every: 1,
    startDate: "2026-03-05",
    endDate: null,
    amountCents: -40_000,
  }

  test("an Overdue Occurrence after the latest check is an item, with its own date", () => {
    const items = walletAttention(input({ schedules: [rent] }))
    expect(items).toEqual([
      {
        kind: "overdueOccurrence",
        walletId: CHECKING,
        scheduleId: "schedule-rent",
        nominalDate: "2026-03-05",
        date: "2026-03-05",
        amountCents: -40_000,
      },
    ])
  })

  test("one dated on or before the latest check is in the bank's balance, so not Overdue", () => {
    const items = walletAttention(
      input({ schedules: [rent], latestCheck: { date: "2026-03-05", amountCents: 100_000 } }),
    )
    expect(items).toEqual([])
  })

  test("Overdue one-off Planned Transactions and Transfers are items; upcoming ones are not", () => {
    const items = walletAttention(
      input({
        planned: [
          {
            id: "one-off",
            walletId: CHECKING,
            date: "2026-03-08",
            amountCents: -100,
            reconciledActualId: null,
          },
          {
            id: "later",
            walletId: CHECKING,
            date: "2026-03-20",
            amountCents: -100,
            reconciledActualId: null,
          },
        ],
        plannedTransfers: [
          {
            id: "transfer",
            fromWalletId: "wallet-savings",
            toWalletId: CHECKING,
            date: "2026-03-03",
            amountCents: 1_000,
            reconciledActualId: null,
          },
        ],
      }),
    )
    expect(items).toEqual([
      {
        kind: "overdueOneOff",
        walletId: CHECKING,
        id: "transfer",
        transfer: true,
        date: "2026-03-03",
        amountCents: 1_000,
      },
      {
        kind: "overdueOneOff",
        walletId: CHECKING,
        id: "one-off",
        transfer: false,
        date: "2026-03-08",
        amountCents: -100,
      },
    ])
  })
})

describe("No Balance check", () => {
  test("a forecast Wallet with no Balance check is an item", () => {
    const items = walletAttention(input({ latestCheck: null }))
    expect(items).toEqual([{ kind: "noBalanceCheck", walletId: CHECKING }])
  })

  test("a Wallet outside the forecast needs none", () => {
    const items = walletAttention({
      wallet: { id: CHECKING, inForecast: false, shownAsOwed: false, lowBalanceThresholdCents: 0 },
      hasBalanceCheck: false,
      toReview: [],
      forecast: null,
    })
    expect(items).toEqual([])
  })
})

/** A made-up one-off bill on Checking. */
function bill(date: string, amountCents: number): ForecastInput["planned"][number] {
  return { id: `bill-${date}`, walletId: CHECKING, date, amountCents, reconciledActualId: null }
}

describe("low balance", () => {
  test("the first day under the threshold and the first under $0 are items", () => {
    const items = walletAttention(
      input({
        wallet: { id: CHECKING, lowBalanceThresholdCents: 50_000 },
        planned: [bill("2026-03-15", -60_000), bill("2026-03-25", -50_000)],
      }),
    )
    expect(items).toEqual([
      {
        kind: "lowBalance",
        walletId: CHECKING,
        under: "threshold",
        thresholdCents: 50_000,
        date: "2026-03-15",
      },
      {
        kind: "lowBalance",
        walletId: CHECKING,
        under: "zero",
        thresholdCents: 50_000,
        date: "2026-03-25",
      },
    ])
  })

  test("a $0 threshold is the $0 warning already, so it is one item", () => {
    const items = walletAttention(input({ planned: [bill("2026-03-15", -200_000)] }))
    expect(items).toEqual([
      {
        kind: "lowBalance",
        walletId: CHECKING,
        under: "zero",
        thresholdCents: 0,
        date: "2026-03-15",
      },
    ])
  })

  test("only within the horizon", () => {
    const items = walletAttention(
      input({ horizonDays: 30, planned: [bill("2026-04-20", -200_000)] }),
    )
    expect(items).toEqual([])
  })
})

/** A Wallet shown as owed, owing $300.00 on Mar 1 with `thresholdCents` (stored negative), and `planned`. */
function owed(thresholdCents: number, planned: ForecastInput["planned"]): AttentionInput {
  const changes = input({
    wallet: { id: CHECKING, lowBalanceThresholdCents: thresholdCents },
    latestCheck: { date: "2026-03-01", amountCents: -30_000 },
    planned,
  })
  return { ...changes, wallet: { ...changes.wallet, shownAsOwed: true } }
}

describe("low balance on a Wallet shown as owed", () => {
  test("owing all horizon is normal for it, so it is not under $0", () => {
    expect(walletAttention(owed(-50_000, []))).toEqual([])
  })

  test("owing more than its threshold is its only low-balance item", () => {
    // Owing $600.00 from Mar 12, past the $500.00 most owed.
    const items = walletAttention(owed(-50_000, [bill("2026-03-12", -30_000)]))
    expect(items).toEqual([
      {
        kind: "lowBalance",
        walletId: CHECKING,
        under: "threshold",
        thresholdCents: -50_000,
        date: "2026-03-12",
      },
    ])
  })

  test("a $0 threshold means no warning", () => {
    expect(walletAttention(owed(0, [bill("2026-03-12", -300_000)]))).toEqual([])
  })
})

test("items come To review first, then Overdue, then the Balance check and low balance", () => {
  const items = walletAttention(
    input(
      {
        planned: [
          {
            id: "late",
            walletId: CHECKING,
            date: "2026-03-08",
            amountCents: -200_000,
            reconciledActualId: null,
          },
        ],
      },
      { toReview: [{ id: "line-1", date: "2026-03-09", amountCents: -500 }] },
    ),
  )
  expect(items.map((item) => item.kind)).toEqual(["toReview", "overdueOneOff", "lowBalance"])
})

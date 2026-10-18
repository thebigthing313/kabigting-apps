import { describe, expect, test } from "vitest"
import { type ForecastInput, type ForecastSchedule, forecast } from "./forecast.ts"
import type { StoredOccurrence } from "./occurrences.ts"

const CHECKING = "wallet-checking"
const SAVINGS = "wallet-savings"
const TODAY = "2026-03-10"

/** A made-up Checking Wallet with a $1,000.00 check on Mar 1 and nothing planned. */
function input(changes: Partial<ForecastInput> = {}): ForecastInput {
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

/** A made-up monthly bill on Checking; tests change only what they are about. */
function schedule(changes: Partial<ForecastSchedule> = {}): ForecastSchedule {
  return {
    id: "schedule-rent",
    walletId: CHECKING,
    toWalletId: null,
    unit: "month",
    every: 1,
    startDate: "2026-03-15",
    endDate: null,
    amountCents: -40_000,
    ...changes,
  }
}

function stored(
  scheduleId: string,
  nominalDate: string,
  changes: Partial<StoredOccurrence> = {},
): StoredOccurrence & { scheduleId: string } {
  return {
    scheduleId,
    nominalDate,
    overrideAmountCents: null,
    overrideDate: null,
    skipped: false,
    reconciledTransactionId: null,
    reconciledTransferId: null,
    ...changes,
  }
}

/** A made-up outstanding one-off bill of $1.00 on Checking. */
function oneOff(id: string, date: string): ForecastInput["planned"][number] {
  return { id, walletId: CHECKING, date, amountCents: -100, reconciledActualId: null }
}

/** A made-up outstanding one-off Transfer of $10.00 from Savings into Checking. */
function transferIn(id: string, date: string): ForecastInput["plannedTransfers"][number] {
  return {
    id,
    fromWalletId: SAVINGS,
    toWalletId: CHECKING,
    date,
    amountCents: 1_000,
    reconciledActualId: null,
  }
}

function balanceOn(result: ReturnType<typeof forecast>, date: string) {
  return result?.days.find((day) => day.date === date)?.balanceCents
}

describe("the starting point", () => {
  test("a Wallet with no Balance check has no Forecast", () => {
    expect(forecast(input({ latestCheck: null }))).toBeNull()
  })

  test("today's balance is the check plus the Actuals dated after it", () => {
    const result = forecast(
      input({
        actualsSince: [
          { id: "a1", date: "2026-03-01", amountCents: -99_999 },
          { id: "a2", date: "2026-03-04", amountCents: -2_500 },
          { id: "a3", date: "2026-03-10", amountCents: 10_000 },
        ],
      }),
    )
    expect(result?.todayBalanceCents).toBe(107_500)
  })

  test("there is one day per day of the horizon, from today, each ending at its balance", () => {
    const result = forecast(input({ horizonDays: 30 }))
    expect(result?.days).toHaveLength(30)
    expect(result?.days[0]).toEqual({ date: "2026-03-10", balanceCents: 100_000, items: [] })
    expect(result?.days.at(-1)?.date).toBe("2026-04-08")
  })

  test("today's Actuals are listed under today, already in its balance", () => {
    const result = forecast(
      input({ actualsSince: [{ id: "a1", date: TODAY, amountCents: -1_000 }] }),
    )
    expect(result?.days[0]).toEqual({
      date: TODAY,
      balanceCents: 99_000,
      items: [{ kind: "actual", id: "a1", date: TODAY, amountCents: -1_000 }],
    })
  })
})

describe("Schedule Occurrences", () => {
  test("land on their date and carry the balance forward", () => {
    const result = forecast(input({ schedules: [schedule()] }))
    expect(balanceOn(result, "2026-03-14")).toBe(100_000)
    expect(balanceOn(result, "2026-03-15")).toBe(60_000)
    expect(balanceOn(result, "2026-04-08")).toBe(60_000)
    expect(result?.days.find((day) => day.date === "2026-03-15")?.items).toEqual([
      {
        kind: "occurrence",
        scheduleId: "schedule-rent",
        nominalDate: "2026-03-15",
        date: "2026-03-15",
        amountCents: -40_000,
        overdue: false,
      },
    ])
  })

  test("only on this Wallet count", () => {
    const result = forecast(input({ schedules: [schedule({ walletId: SAVINGS })] }))
    expect(balanceOn(result, "2026-04-08")).toBe(100_000)
  })

  test("Overdue ones after the Balance check count today and sit under today marked Overdue", () => {
    const result = forecast(
      input({
        latestCheck: { date: "2026-01-04", amountCents: 100_000 },
        schedules: [schedule({ startDate: "2026-01-05", amountCents: -1_000 })],
      }),
    )
    // Jan 5, Feb 5 and Mar 5 are Overdue; Apr 5 is upcoming.
    expect(result?.days[0]?.balanceCents).toBe(97_000)
    expect(
      result?.days[0]?.items.map((item) => [
        item.date,
        item.kind,
        "overdue" in item && item.overdue,
      ]),
    ).toEqual([
      ["2026-01-05", "occurrence", true],
      ["2026-02-05", "occurrence", true],
      ["2026-03-05", "occurrence", true],
    ])
    expect(balanceOn(result, "2026-04-05")).toBe(96_000)
  })

  test("Overdue ones dated on or before the Balance check are taken as already in it", () => {
    const result = forecast(
      input({
        latestCheck: { date: "2026-02-05", amountCents: 100_000 },
        schedules: [schedule({ startDate: "2026-01-05", amountCents: -1_000 })],
      }),
    )
    // Jan 5 and Feb 5 are in the check; only Mar 5 counts today.
    expect(result?.days[0]?.balanceCents).toBe(99_000)
    expect(result?.days[0]?.items).toMatchObject([{ date: "2026-03-05", overdue: true }])
  })

  test("an Overdue one moved by its override to after the Balance check counts today", () => {
    const result = forecast(
      input({
        latestCheck: { date: "2026-02-05", amountCents: 100_000 },
        schedules: [schedule({ startDate: "2026-01-05", endDate: "2026-01-05" })],
        occurrences: [stored("schedule-rent", "2026-01-05", { overrideDate: "2026-02-06" })],
      }),
    )
    expect(result?.days[0]?.items).toMatchObject([
      { nominalDate: "2026-01-05", date: "2026-02-06", overdue: true },
    ])
  })

  test("one due today is not Overdue", () => {
    const result = forecast(input({ schedules: [schedule({ startDate: TODAY })] }))
    expect(result?.days[0]?.balanceCents).toBe(60_000)
    expect(result?.days[0]?.items).toMatchObject([{ date: TODAY, overdue: false }])
  })

  test("of a Transfer Schedule move money out of one forecast Wallet and into the other", () => {
    const transfer = schedule({ toWalletId: SAVINGS, amountCents: 25_000 })
    const checking = forecast(input({ schedules: [transfer] }))
    const savings = forecast(
      input({
        wallet: { id: SAVINGS, lowBalanceThresholdCents: 0 },
        latestCheck: { date: "2026-03-01", amountCents: 5_000 },
        schedules: [transfer],
      }),
    )
    expect(balanceOn(checking, "2026-03-15")).toBe(75_000)
    expect(balanceOn(savings, "2026-03-15")).toBe(30_000)
    expect(savings?.days.find((day) => day.date === "2026-03-15")?.items).toMatchObject([
      { kind: "occurrence", amountCents: 25_000 },
    ])
  })

  test("take their override's amount and date, and skipped or Reconciled ones drop out", () => {
    const result = forecast(
      input({
        schedules: [schedule({ startDate: "2026-02-15" })],
        occurrences: [
          stored("schedule-rent", "2026-02-15", { reconciledTransactionId: "actual-1" }),
          stored("schedule-rent", "2026-03-15", {
            overrideAmountCents: -45_000,
            overrideDate: "2026-03-20",
          }),
          stored("schedule-rent", "2026-04-15", { skipped: true }),
          stored("other-schedule", "2026-03-16", { overrideAmountCents: -1 }),
        ],
      }),
    )
    expect(result?.days[0]?.items).toEqual([])
    expect(balanceOn(result, "2026-03-15")).toBe(100_000)
    expect(balanceOn(result, "2026-03-20")).toBe(55_000)
    expect(balanceOn(result, "2026-04-08")).toBe(55_000)
    expect(result?.days.find((day) => day.date === "2026-03-20")?.items).toMatchObject([
      { nominalDate: "2026-03-15", date: "2026-03-20", amountCents: -45_000 },
    ])
  })

  test("past the horizon are left out", () => {
    const result = forecast(input({ schedules: [schedule({ startDate: "2026-04-09" })] }))
    expect(result?.days.every((day) => day.items.length === 0)).toBe(true)
  })
})

describe("one-off Planned items", () => {
  test("outstanding Transactions on this Wallet land on their date, Overdue ones today", () => {
    const result = forecast(
      input({
        planned: [
          {
            id: "p1",
            walletId: CHECKING,
            date: "2026-03-02",
            amountCents: -500,
            reconciledActualId: null,
          },
          {
            id: "p2",
            walletId: CHECKING,
            date: "2026-03-12",
            amountCents: 2_000,
            reconciledActualId: null,
          },
          {
            id: "p3",
            walletId: CHECKING,
            date: "2026-03-12",
            amountCents: -9,
            reconciledActualId: "a1",
          },
          {
            id: "p4",
            walletId: SAVINGS,
            date: "2026-03-12",
            amountCents: -9,
            reconciledActualId: null,
          },
        ],
      }),
    )
    expect(result?.days[0]).toEqual({
      date: TODAY,
      balanceCents: 99_500,
      items: [{ kind: "planned", id: "p1", date: "2026-03-02", amountCents: -500, overdue: true }],
    })
    expect(result?.days.find((day) => day.date === "2026-03-12")).toEqual({
      date: "2026-03-12",
      balanceCents: 101_500,
      items: [
        { kind: "planned", id: "p2", date: "2026-03-12", amountCents: 2_000, overdue: false },
      ],
    })
  })

  test("Overdue ones dated on or before the Balance check are taken as already in it", () => {
    // The check is on Mar 5: Mar 4 and Mar 5 are in it, Mar 6 is not.
    const result = forecast(
      input({
        latestCheck: { date: "2026-03-05", amountCents: 100_000 },
        planned: [
          oneOff("p1", "2026-03-04"),
          oneOff("p2", "2026-03-05"),
          oneOff("p3", "2026-03-06"),
        ],
      }),
    )
    expect(result?.days[0]?.items).toEqual([
      { kind: "planned", id: "p3", date: "2026-03-06", amountCents: -100, overdue: true },
    ])
    expect(result?.days[0]?.balanceCents).toBe(99_900)
  })

  test("upcoming ones count even when the Balance check is dated ahead of them", () => {
    const result = forecast(
      input({
        latestCheck: { date: "2026-03-12", amountCents: 100_000 },
        planned: [oneOff("p1", "2026-03-11")],
      }),
    )
    expect(balanceOn(result, "2026-03-11")).toBe(99_900)
  })

  test("Overdue Transfers dated on or before the Balance check are left out too", () => {
    const result = forecast(
      input({
        latestCheck: { date: "2026-03-05", amountCents: 100_000 },
        plannedTransfers: [transferIn("t1", "2026-03-05"), transferIn("t2", "2026-03-06")],
      }),
    )
    expect(result?.days[0]?.items).toEqual([
      { kind: "plannedTransfer", id: "t2", date: "2026-03-06", amountCents: 1_000, overdue: true },
    ])
  })

  test("Transfers move money out of the from Wallet and into the to Wallet", () => {
    const plannedTransfers = [
      {
        id: "t1",
        fromWalletId: CHECKING,
        toWalletId: SAVINGS,
        date: "2026-03-12",
        amountCents: 3_000,
        reconciledActualId: null,
      },
      {
        id: "t2",
        fromWalletId: SAVINGS,
        toWalletId: CHECKING,
        date: "2026-03-13",
        amountCents: 1_000,
        reconciledActualId: null,
      },
      {
        id: "t3",
        fromWalletId: CHECKING,
        toWalletId: SAVINGS,
        date: "2026-03-13",
        amountCents: 9,
        reconciledActualId: "a1",
      },
    ]
    const result = forecast(input({ plannedTransfers }))
    expect(balanceOn(result, "2026-03-12")).toBe(97_000)
    expect(balanceOn(result, "2026-03-13")).toBe(98_000)
    expect(result?.days.find((day) => day.date === "2026-03-13")?.items).toEqual([
      { kind: "plannedTransfer", id: "t2", date: "2026-03-13", amountCents: 1_000, overdue: false },
    ])
  })
})

describe("warnings", () => {
  const bills = [
    schedule({ id: "s1", startDate: "2026-03-12", endDate: "2026-03-12", amountCents: -95_000 }),
    schedule({ id: "s2", startDate: "2026-03-14", endDate: "2026-03-14", amountCents: -10_000 }),
    schedule({ id: "s3", startDate: "2026-03-16", endDate: "2026-03-16", amountCents: -5_000 }),
    schedule({ id: "s4", startDate: "2026-03-20", endDate: "2026-03-20", amountCents: 50_000 }),
  ]

  test("give the low point, the first day under the threshold and the first day under $0", () => {
    const result = forecast(
      input({ wallet: { id: CHECKING, lowBalanceThresholdCents: 10_000 }, schedules: bills }),
    )
    // 100,000 → 5,000 on Mar 12 → -5,000 on Mar 14 → -10,000 on Mar 16 → 40,000 on Mar 20.
    expect(result?.low).toEqual({ date: "2026-03-16", balanceCents: -10_000 })
    expect(result?.firstUnderThreshold).toBe("2026-03-12")
    expect(result?.firstUnderZero).toBe("2026-03-14")
  })

  test("are absent when the balance never drops under them", () => {
    const result = forecast(input({ schedules: [schedule({ amountCents: 5_000 })] }))
    expect(result?.low).toEqual({ date: TODAY, balanceCents: 100_000 })
    expect(result?.firstUnderThreshold).toBeNull()
    expect(result?.firstUnderZero).toBeNull()
  })

  test("the low point is its first day when the balance stays there", () => {
    const result = forecast(input({ schedules: [bills[0]!] }))
    expect(result?.low).toEqual({ date: "2026-03-12", balanceCents: 5_000 })
  })

  test("a balance equal to the threshold is not under it", () => {
    const result = forecast(
      input({ wallet: { id: CHECKING, lowBalanceThresholdCents: 5_000 }, schedules: [bills[0]!] }),
    )
    expect(result?.firstUnderThreshold).toBeNull()
  })
})

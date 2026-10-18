/**
 * The Forecast: one Wallet's end-of-day balance for each day from today, starting from its latest
 * Balance check. Never stored; computed whenever it is shown.
 */
import { addDays } from "../dates.ts"
import { balanceSince } from "./balance-checks.ts"
import { expandSchedule, type ScheduleTerms, type StoredOccurrence } from "./occurrences.ts"

/** The horizons a person can pick, in days. */
export const FORECAST_HORIZONS = [30, 90, 180, 365] as const
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number]
export const DEFAULT_HORIZON: ForecastHorizon = 90

/** The parts of a Schedule the Forecast needs. */
export type ForecastSchedule = ScheduleTerms & {
  id: string
  /** The Wallet it draws on, or a Transfer's from Wallet. */
  walletId: string
  /** Set only on a Transfer Schedule. */
  toWalletId: string | null
}

export type ForecastInput = {
  wallet: { id: string; lowBalanceThresholdCents: number }
  latestCheck: { date: string; amountCents: number } | null
  /** This Wallet's Actuals dated after the check, signed as they moved this Wallet. */
  actualsSince: readonly { id: string; date: string; amountCents: number }[]
  /** One-off Planned Transactions, on any Wallet. */
  planned: readonly {
    id: string
    walletId: string
    date: string
    amountCents: number
    reconciledActualId: string | null
  }[]
  /** One-off Planned Transfers, on any Wallets; amounts are positive. */
  plannedTransfers: readonly {
    id: string
    fromWalletId: string
    toWalletId: string
    date: string
    amountCents: number
    reconciledActualId: string | null
  }[]
  schedules: readonly ForecastSchedule[]
  /** Stored Occurrences of any Schedule. */
  occurrences: readonly (StoredOccurrence & { scheduleId: string })[]
  today: string
  horizonDays: number
}

export type ForecastItem =
  | { kind: "actual"; id: string; date: string; amountCents: number }
  | {
      kind: "occurrence"
      scheduleId: string
      nominalDate: string
      /** Its own date; an Overdue one is listed under today but keeps this. */
      date: string
      /** Signed as it moves this Wallet. */
      amountCents: number
      overdue: boolean
    }
  | {
      kind: "planned" | "plannedTransfer"
      id: string
      date: string
      /** Signed as it moves this Wallet. */
      amountCents: number
      overdue: boolean
    }

export type ForecastDay = {
  date: string
  /** The end-of-day balance. */
  balanceCents: number
  items: ForecastItem[]
}

export type Forecast = {
  /** The check plus the Actuals dated after it, before anything Planned. */
  todayBalanceCents: number
  /** One per day from today to today + horizon − 1. */
  days: ForecastDay[]
  /** The lowest end-of-day balance in the horizon, on its first day. */
  low: { date: string; balanceCents: number }
  /** The first day whose end-of-day balance is under the Wallet's low-balance threshold. */
  firstUnderThreshold: string | null
  /** The first day whose end-of-day balance is under $0. */
  firstUnderZero: string | null
}

/**
 * How an amount on `walletId` moves this Wallet: 1 as stored, -1 for money a Transfer takes out,
 * 0 when it does not touch this Wallet. A Transaction's amount is already signed; a Transfer's
 * is positive, as money moved from `walletId` to `toWalletId`.
 */
function signOn(walletId: string, toWalletId: string | null, thisWallet: string) {
  if (walletId === thisWallet) return toWalletId === null ? 1 : -1
  return toWalletId === thisWallet ? 1 : 0
}

/** The outstanding Occurrences that move this Wallet, dated `from` to `to`, signed for it. */
function occurrenceItems(input: ForecastInput, from: string, to: string): ForecastItem[] {
  const { wallet, today } = input
  const items: ForecastItem[] = []
  for (const schedule of input.schedules) {
    // A Transfer moves money out of its from Wallet and into its to Wallet.
    const sign = signOn(schedule.walletId, schedule.toWalletId, wallet.id)
    if (sign === 0) continue
    const stored = input.occurrences.filter((row) => row.scheduleId === schedule.id)
    for (const occurrence of expandSchedule(schedule, stored, { from, to }, today)) {
      if (occurrence.state !== "upcoming" && occurrence.state !== "overdue") continue
      items.push({
        kind: "occurrence",
        scheduleId: schedule.id,
        nominalDate: occurrence.nominalDate,
        date: occurrence.date,
        amountCents: sign * occurrence.amountCents,
        overdue: occurrence.state === "overdue",
      })
    }
  }
  return items
}

/** The outstanding one-off Planned Transactions and Transfers that move this Wallet, `from` to `to`. */
function oneOffItems(input: ForecastInput, from: string, to: string): ForecastItem[] {
  const { wallet, today } = input
  const items: ForecastItem[] = []
  const outstanding = (row: { date: string; reconciledActualId: string | null }) =>
    row.reconciledActualId === null && row.date >= from && row.date <= to
  for (const row of input.planned) {
    if (row.walletId !== wallet.id || !outstanding(row)) continue
    const { id, date, amountCents } = row
    items.push({ kind: "planned", id, date, amountCents, overdue: date < today })
  }
  for (const row of input.plannedTransfers) {
    const sign = signOn(row.fromWalletId, row.toWalletId, wallet.id)
    if (sign === 0 || !outstanding(row)) continue
    const { id, date } = row
    const amountCents = sign * row.amountCents
    items.push({ kind: "plannedTransfer", id, date, amountCents, overdue: date < today })
  }
  return items
}

export function forecast(input: ForecastInput): Forecast | null {
  const { latestCheck, today, horizonDays } = input
  if (latestCheck === null) return null
  if (!Number.isInteger(horizonDays) || horizonDays < 1) {
    throw new RangeError("A Forecast covers at least one day")
  }
  const todayBalanceCents = balanceSince(latestCheck, input.actualsSince)
  const lastDay = addDays(today, horizonDays - 1)

  // Anything Planned dated on or before the check is taken as already in the bank's balance, so
  // even when Overdue it does not count again. From today at the latest, should a check be dated
  // ahead of today.
  const afterCheck = addDays(latestCheck.date, 1)
  const from = afterCheck < today ? afterCheck : today

  // Planned items land on their date; Overdue ones land on today.
  const outstanding = [
    ...occurrenceItems(input, from, lastDay),
    ...oneOffItems(input, from, lastDay),
  ]
  const planned = new Map<string, ForecastItem[]>()
  for (const item of outstanding) {
    const day = item.date < today ? today : item.date
    planned.set(day, [...(planned.get(day) ?? []), item])
  }

  const days: ForecastDay[] = []
  let balanceCents = todayBalanceCents
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = addDays(today, offset)
    // Actuals are already in today's balance; today's are listed for reference.
    const actuals: ForecastItem[] =
      offset === 0
        ? input.actualsSince
            .filter((actual) => actual.date === today)
            .map(({ id, amountCents }) => ({ kind: "actual", id, date, amountCents }))
        : []
    const due = (planned.get(date) ?? []).toSorted((a, b) => a.date.localeCompare(b.date))
    balanceCents += due.reduce((total, item) => total + item.amountCents, 0)
    days.push({ date, balanceCents, items: [...due, ...actuals] })
  }

  const firstUnder = (limit: number) => days.find((day) => day.balanceCents < limit)?.date ?? null
  const lowDay = days.reduce((low, day) => (day.balanceCents < low.balanceCents ? day : low))
  return {
    todayBalanceCents,
    days,
    low: { date: lowDay.date, balanceCents: lowDay.balanceCents },
    firstUnderThreshold: firstUnder(input.wallet.lowBalanceThresholdCents),
    firstUnderZero: firstUnder(0),
  }
}

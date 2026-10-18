/**
 * Reconcile: pairing an Actual with the Planned item it fulfils. The app suggests candidates and
 * a person confirms one; the Actual's amount and date are the truth.
 */
import { daysBetween, today as householdToday } from "../dates.ts"
import { expandSchedule, type ScheduleTerms, type StoredOccurrence } from "./occurrences.ts"

/** How many days either side of an Actual a suggested Planned item may be dated. */
export const MATCH_WINDOW_DAYS = 7

type PlannedDetails = {
  walletId: string
  /** Where it lands: an Occurrence's override, else its nominal date. */
  date: string
  /** Signed, as it moves the Wallet. */
  amountCents: number
  accountId: string | null
  categoryId: string | null
}

/** An outstanding Planned item an Actual can be Reconciled to: an Occurrence or a one-off. */
export type PlannedItem =
  | ({ kind: "occurrence"; scheduleId: string; nominalDate: string } & PlannedDetails)
  | ({ kind: "transaction"; id: string } & PlannedDetails)

/** One string naming a Planned item, unique among a Wallet's outstanding ones. */
export function plannedKey(item: PlannedItem): string {
  return item.kind === "occurrence" ? `occurrence:${item.scheduleId}:${item.nominalDate}` : item.id
}

/**
 * The outstanding Planned items to suggest for `actual`, best first: those in the same Wallet,
 * with the same sign, dated within 7 days either side. They rank by closeness of amount, then of
 * date.
 */
export function suggestMatches<Item extends PlannedDetails>(
  actual: { walletId: string; date: string; amountCents: number },
  outstanding: readonly Item[],
): Item[] {
  const daysOff = (item: Item) => Math.abs(daysBetween(actual.date, item.date))
  const amountOff = (item: Item) => Math.abs(item.amountCents - actual.amountCents)
  return outstanding
    .filter(
      (item) =>
        item.walletId === actual.walletId &&
        Math.sign(item.amountCents) === Math.sign(actual.amountCents) &&
        daysOff(item) <= MATCH_WINDOW_DAYS,
    )
    .toSorted((a, b) => amountOff(a) - amountOff(b) || daysOff(a) - daysOff(b))
}

export type OutstandingInput = {
  walletId: string
  schedules: readonly (ScheduleTerms & {
    id: string
    walletId: string
    toWalletId: string | null
    accountId: string | null
    categoryId: string | null
  })[]
  /** Stored Occurrences of any Schedule. */
  occurrences: readonly (StoredOccurrence & { scheduleId: string })[]
  /** One-off Planned Transactions, on any Wallet. */
  planned: readonly ({ id: string; reconciledActualId: string | null } & PlannedDetails)[]
  /** Inclusive dates the items land on. */
  range: { from: string; to: string }
  today?: string
}

/**
 * A Wallet's outstanding Planned Transactions dated in the range, by date: its Schedules'
 * upcoming and Overdue Occurrences, and its one-offs not yet Reconciled. Transfer Schedules are
 * left out: an Actual Transaction is Reconciled to a Planned Transfer once Transfers exist.
 */
export function outstandingPlanned(input: OutstandingInput): PlannedItem[] {
  const { walletId, range } = input
  const now = input.today ?? householdToday()
  const items: PlannedItem[] = []
  for (const schedule of input.schedules) {
    if (schedule.walletId !== walletId || schedule.toWalletId !== null) continue
    const stored = input.occurrences.filter((row) => row.scheduleId === schedule.id)
    for (const occurrence of expandSchedule(schedule, stored, range, now)) {
      if (occurrence.state !== "upcoming" && occurrence.state !== "overdue") continue
      items.push({
        kind: "occurrence",
        scheduleId: schedule.id,
        nominalDate: occurrence.nominalDate,
        walletId,
        date: occurrence.date,
        amountCents: occurrence.amountCents,
        accountId: schedule.accountId,
        categoryId: schedule.categoryId,
      })
    }
  }
  for (const row of input.planned) {
    const inRange = row.date >= range.from && row.date <= range.to
    if (row.walletId !== walletId || row.reconciledActualId !== null || !inRange) continue
    const { id, date, amountCents, accountId, categoryId } = row
    items.push({ kind: "transaction", id, walletId, date, amountCents, accountId, categoryId })
  }
  return items.toSorted((a, b) => a.date.localeCompare(b.date))
}

/**
 * Occurrences: the dates a Schedule falls on. They are computed here, never stored, except when a
 * person overrides, skips or Reconciles one; then the stored row, keyed by its nominal date, wins.
 */
import {
  addDays,
  addMonthsClamped,
  dayOfMonth,
  daysBetween,
  formatMonthDay,
  today as householdToday,
  weekdayName,
} from "../dates.ts"

export type ScheduleUnit = "week" | "month"

/** The parts of a Schedule that decide its Occurrences. */
export type ScheduleTerms = {
  unit: ScheduleUnit
  /** Repeats every this many weeks or months; at least 1. */
  every: number
  /** The first Occurrence. */
  startDate: string
  /** The last day an Occurrence may fall on, inclusive; null when it never ends. */
  endDate: string | null
  amountCents: number
}

/** The nominal date of the `index`-th Occurrence, counted from the start date (0). */
function nominalAt(schedule: ScheduleTerms, index: number): string {
  return schedule.unit === "week"
    ? addDays(schedule.startDate, index * schedule.every * 7)
    : // Always from the start date, so a 31st anchor survives a short month.
      addMonthsClamped(schedule.startDate, index * schedule.every)
}

/** An index whose nominal date is on or before `date` (or 0), to start walking from. */
function indexNear(schedule: ScheduleTerms, date: string): number {
  const days = daysBetween(schedule.startDate, date)
  if (days <= 0) return 0
  const periodDays = schedule.unit === "week" ? schedule.every * 7 : schedule.every * 31
  return Math.max(0, Math.floor(days / periodDays) - 1)
}

export type OccurrenceState = "upcoming" | "overdue" | "skipped" | "reconciled"

export type Occurrence = {
  /** The date the Schedule's terms put it on; with the Schedule, it names the Occurrence. */
  nominalDate: string
  /** The date it lands on: the override, else the nominal date. */
  date: string
  amountCents: number
  state: OccurrenceState
}

/** The nominal dates in `[from, to]`, within the Schedule's start and end dates. */
function nominalDates(schedule: ScheduleTerms, from: string, to: string): string[] {
  const last = schedule.endDate !== null && schedule.endDate < to ? schedule.endDate : to
  const found: string[] = []
  for (let index = indexNear(schedule, from); ; index += 1) {
    const nominal = nominalAt(schedule, index)
    if (nominal > last) return found
    if (nominal >= from) found.push(nominal)
  }
}

/** A stored Occurrence: one a person overrode, skipped or Reconciled. */
export type StoredOccurrence = {
  nominalDate: string
  overrideAmountCents: number | null
  overrideDate: string | null
  skipped: boolean
  reconciledTransactionId: string | null
  reconciledTransferId: string | null
}

function stateOf(date: string, row: StoredOccurrence | undefined, today: string): OccurrenceState {
  if (row && (row.reconciledTransactionId !== null || row.reconciledTransferId !== null)) {
    return "reconciled"
  }
  if (row?.skipped) return "skipped"
  return date < today ? "overdue" : "upcoming"
}

function isNominal(schedule: ScheduleTerms, date: string): boolean {
  return nominalDates(schedule, date, date).length === 1
}

/**
 * Every Occurrence whose date falls in `[from, to]`, in date order. `stored` holds this Schedule's
 * stored Occurrences; one whose override moves it into the range is included even when its
 * nominal date is outside, and one moved out is left out. `today` decides what is Overdue.
 */
export function expandSchedule(
  schedule: ScheduleTerms,
  stored: readonly StoredOccurrence[],
  range: { from: string; to: string },
  today: string = householdToday(),
): Occurrence[] {
  const byNominal = new Map(stored.map((row) => [row.nominalDate, row]))
  const nominals = new Set(nominalDates(schedule, range.from, range.to))
  for (const row of stored) {
    const date = row.overrideDate ?? row.nominalDate
    if (date >= range.from && date <= range.to && isNominal(schedule, row.nominalDate)) {
      nominals.add(row.nominalDate)
    }
  }
  const occurrences: Occurrence[] = []
  for (const nominalDate of nominals) {
    const row = byNominal.get(nominalDate)
    const date = row?.overrideDate ?? nominalDate
    if (date < range.from || date > range.to) continue
    occurrences.push({
      nominalDate,
      date,
      amountCents: row?.overrideAmountCents ?? schedule.amountCents,
      state: stateOf(date, row, today),
    })
  }
  return occurrences.toSorted(
    (a, b) => a.date.localeCompare(b.date) || a.nominalDate.localeCompare(b.nominalDate),
  )
}

/**
 * The next Occurrence still to happen: the first dated `today` or later that is neither skipped
 * nor Reconciled. Null once the Schedule has none left.
 */
export function nextOccurrence(
  schedule: ScheduleTerms,
  stored: readonly StoredOccurrence[],
  today: string = householdToday(),
): Occurrence | null {
  // Walk forward a few periods at a time; stored rows are finite, so an unstored one comes soon.
  const fourPeriodsFrom = (from: string) =>
    schedule.unit === "week"
      ? addDays(from, schedule.every * 7 * 4)
      : addMonthsClamped(from, schedule.every * 4)
  let from = today
  let to = fourPeriodsFrom(schedule.startDate > today ? schedule.startDate : today)
  const lastDate = [schedule.endDate, ...stored.map((row) => row.overrideDate)]
    .filter((date) => date !== null)
    .reduce((latest, date) => (date > latest ? date : latest), "")
  for (;;) {
    const next = expandSchedule(schedule, stored, { from, to }, today).find(
      (occurrence) => occurrence.state === "upcoming",
    )
    if (next) return next
    if (schedule.endDate !== null && to >= lastDate) return null
    from = addDays(to, 1)
    to = fourPeriodsFrom(from)
  }
}

function ordinal(day: number): string {
  const teen = day % 100 >= 11 && day % 100 <= 13
  const suffix = teen ? "th" : (({ 1: "st", 2: "nd", 3: "rd" } as const)[day % 10] ?? "th")
  return `${day}${suffix}`
}

/** The terms in words, such as "Monthly on the 1st" or "Every 2 weeks on Friday". */
export function describeTerms(schedule: Pick<ScheduleTerms, "unit" | "every" | "startDate">) {
  const { unit, every, startDate } = schedule
  if (unit === "week") {
    const day = weekdayName(startDate)
    return every === 1 ? `Weekly on ${day}` : `Every ${every} weeks on ${day}`
  }
  if (every % 12 === 0) {
    const years = every / 12
    const day = formatMonthDay(startDate)
    return years === 1 ? `Yearly on ${day}` : `Every ${years} years on ${day}`
  }
  const day = `the ${ordinal(dayOfMonth(startDate))}`
  return every === 1 ? `Monthly on ${day}` : `Every ${every} months on ${day}`
}

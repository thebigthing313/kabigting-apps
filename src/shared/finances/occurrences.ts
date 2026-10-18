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

/** True when an Actual is Reconciled to the stored Occurrence. */
export function isReconciled(
  row: Pick<StoredOccurrence, "reconciledTransactionId" | "reconciledTransferId">,
): boolean {
  return row.reconciledTransactionId !== null || row.reconciledTransferId !== null
}

function stateOf(date: string, row: StoredOccurrence | undefined, today: string): OccurrenceState {
  if (row && isReconciled(row)) return "reconciled"
  if (row?.skipped) return "skipped"
  return date < today ? "overdue" : "upcoming"
}

/** True when the Schedule's terms put an Occurrence on `date`, within its start and end dates. */
export function isOccurrenceDate(schedule: ScheduleTerms, date: string): boolean {
  return nominalDates(schedule, date, date).length === 1
}

/** A person's edit of one Occurrence: where it lands, how much, and whether it is skipped. */
export type OccurrenceEdit = { amountCents: number; date: string; skipped: boolean }

export type OccurrenceOverride = Pick<
  StoredOccurrence,
  "overrideAmountCents" | "overrideDate" | "skipped"
>

/**
 * What to store for an edited Occurrence: only what differs from the Schedule's terms. Null when
 * the edit leaves it on those terms, so nothing need be stored.
 */
export function overrideFor(
  schedule: ScheduleTerms,
  nominalDate: string,
  edit: OccurrenceEdit,
): OccurrenceOverride | null {
  const override = {
    overrideAmountCents: edit.amountCents === schedule.amountCents ? null : edit.amountCents,
    overrideDate: edit.date === nominalDate ? null : edit.date,
    skipped: edit.skipped,
  }
  return hasOverride(override) ? override : null
}

/** True when a person changed the Occurrence's amount or date, or skipped it. */
export function hasOverride(row: OccurrenceOverride): boolean {
  return row.overrideAmountCents !== null || row.overrideDate !== null || row.skipped
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
    if (date >= range.from && date <= range.to && isOccurrenceDate(schedule, row.nominalDate)) {
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
 * As `expandSchedule`, plus every Occurrence whose nominal date is in the range but whose
 * override moved it out, on its new date. A Schedule's page lists these so a moved Occurrence can
 * still be found and edited where it was scheduled.
 */
export function occurrencesAround(
  schedule: ScheduleTerms,
  stored: readonly StoredOccurrence[],
  range: { from: string; to: string },
  today: string = householdToday(),
): Occurrence[] {
  const inRange = expandSchedule(schedule, stored, range, today)
  const movedOut = stored.flatMap((row) => {
    const date = row.overrideDate ?? row.nominalDate
    const nominalIn = row.nominalDate >= range.from && row.nominalDate <= range.to
    if (!nominalIn || (date >= range.from && date <= range.to)) return []
    return expandSchedule(schedule, stored, { from: date, to: date }, today).filter(
      (occurrence) => occurrence.nominalDate === row.nominalDate,
    )
  })
  return [...inRange, ...movedOut].toSorted(
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

/**
 * The stored overrides and skips that ending a Schedule on `endDate` deletes: those whose nominal
 * date is after it, in date order. A Reconciled Occurrence is never among them.
 */
export function overridesAfter<Row extends StoredOccurrence>(
  stored: readonly Row[],
  endDate: string,
): Row[] {
  return stored
    .filter((row) => row.nominalDate > endDate && !isReconciled(row))
    .toSorted((a, b) => a.nominalDate.localeCompare(b.nominalDate))
}

/**
 * The stored overrides and skips that changing the Schedule from `date` to `terms` deletes: those
 * on or after `date` (by nominal date) that the new terms never fall on, in date order. The rest
 * move to the new terms. A Reconciled Occurrence is never among them.
 */
export function overridesOffNewTerms<Row extends StoredOccurrence>(
  stored: readonly Row[],
  date: string,
  terms: ScheduleTerms,
): Row[] {
  return stored
    .filter(
      (row) =>
        row.nominalDate >= date && !isReconciled(row) && !isOccurrenceDate(terms, row.nominalDate),
    )
    .toSorted((a, b) => a.nominalDate.localeCompare(b.nominalDate))
}

/**
 * The Reconciled Occurrences dated `date` or later (by nominal date), in date order. A Schedule
 * can't end or change before one: it would vanish from the Schedule, and a successor falling on
 * the same date would count it in the Forecast again. Un-Reconcile it, or pick a later date.
 */
export function reconciledFrom<Row extends StoredOccurrence>(
  stored: readonly Row[],
  date: string,
): Row[] {
  return stored
    .filter((row) => row.nominalDate >= date && isReconciled(row))
    .toSorted((a, b) => a.nominalDate.localeCompare(b.nominalDate))
}

/** A Schedule's place in a chain: the Schedule a change from a date continued, if any. */
export type ChainLink = { id: string; predecessorId: string | null }

/**
 * Every Schedule in the chain `id` belongs to, newest first: the Schedules that changed from a
 * date read as one. Empty when there is no such Schedule.
 */
export function scheduleChain<Link extends ChainLink>(
  schedules: readonly Link[],
  id: string,
): Link[] {
  const byId = new Map(schedules.map((schedule) => [schedule.id, schedule]))
  const successorOf = new Map(
    schedules.flatMap((schedule) =>
      schedule.predecessorId === null ? [] : [[schedule.predecessorId, schedule] as const],
    ),
  )
  let newest = byId.get(id)
  if (!newest) return []
  // Guard against a cycle, which the server never makes, so a bad row can't hang the page.
  const seen = new Set<string>([newest.id])
  for (let next = successorOf.get(newest.id); next && !seen.has(next.id);) {
    seen.add(next.id)
    newest = next
    next = successorOf.get(next.id)
  }
  const chain: Link[] = []
  const walked = new Set<string>()
  for (let link: Link | undefined = newest; link && !walked.has(link.id);) {
    walked.add(link.id)
    chain.push(link)
    link = link.predecessorId === null ? undefined : byId.get(link.predecessorId)
  }
  return chain
}

/** True once the Schedule's end date has passed; it then sits in the Schedules list's Ended group. */
export function isEnded(schedule: Pick<ScheduleTerms, "endDate">, today: string): boolean {
  return schedule.endDate !== null && schedule.endDate < today
}

/**
 * The chain's next Occurrence still to happen, and the Schedule it falls on: until a change from
 * a date takes effect, it is the older terms'. `stored` may hold any Schedule's rows.
 */
export function nextInChain<Schedule extends ScheduleTerms & { id: string }>(
  chain: readonly Schedule[],
  stored: readonly (StoredOccurrence & { scheduleId: string })[],
  today: string = householdToday(),
): { schedule: Schedule; occurrence: Occurrence } | null {
  let soonest: { schedule: Schedule; occurrence: Occurrence } | null = null
  for (const schedule of chain) {
    const own = stored.filter((row) => row.scheduleId === schedule.id)
    const occurrence = nextOccurrence(schedule, own, today)
    if (occurrence && (soonest === null || occurrence.date < soonest.occurrence.date)) {
      soonest = { schedule, occurrence }
    }
  }
  return soonest
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

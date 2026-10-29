/**
 * The only module that imports date-fns. Calendar dates are `YYYY-MM-DD` strings with no zone;
 * instants are ISO-8601 UTC strings. "Today" and month boundaries use the household zone.
 * Never `new Date("YYYY-MM-DD")`: it parses as UTC midnight, the wrong day in New York.
 */
import { TZDate } from "@date-fns/tz"
import { addDays as addCalendarDays, addMonths, format, formatDistanceStrict } from "date-fns"

export const HOUSEHOLD_ZONE = "America/New_York"

/** The household's calendar date right now. */
export function today(): string {
  return format(new TZDate(Date.now(), HOUSEHOLD_ZONE), "yyyy-MM-dd")
}

/** Instant as an ISO-8601 UTC string, whatever zone the Date-like value carries. */
function toInstant(date: Date): string {
  return new Date(date.getTime()).toISOString()
}

/**
 * The household month `YYYY-MM` as a half-open interval of instants: `start <= t < end`.
 * Month lengths in hours follow DST, so never compute these by adding fixed offsets.
 */
export function monthInstantRange(month: string): { start: string; end: string } {
  const [year, monthNumber] = month.split("-").map(Number)
  const start = new TZDate(year!, monthNumber! - 1, 1, HOUSEHOLD_ZONE)
  return { start: toInstant(start), end: toInstant(addMonths(start, 1)) }
}

/** The household month (`YYYY-MM`) an ISO-8601 instant falls in. */
export function monthOf(instant: string): string {
  return format(new TZDate(Date.parse(instant), HOUSEHOLD_ZONE), "yyyy-MM")
}

/** A moment given in milliseconds since the epoch, as an ISO-8601 UTC string. */
export function instantAt(ms: number): string {
  return new Date(ms).toISOString()
}

/** The current moment as an ISO-8601 UTC string. */
export function nowInstant(): string {
  return new Date().toISOString()
}

/**
 * How long ago an instant was, for "Edited … ago": "just now" under a minute, then whole minutes,
 * hours, days and so on, rounded down.
 */
export function timeAgo(instant: string, now: number = Date.now()): string {
  const at = Date.parse(instant)
  if (now - at < 60_000) return "just now"
  return formatDistanceStrict(at, now, { addSuffix: true, roundingMethod: "floor" })
}

function parts(date: string): [number, number, number] {
  const [year, month, day] = date.split("-").map(Number)
  return [year ?? Number.NaN, month ?? Number.NaN, day ?? Number.NaN]
}

/**
 * A calendar date as a local-midnight `Date` for date pickers, which work in the device's zone.
 * Only for UI widgets; store and send the `YYYY-MM-DD` string.
 */
export function toPickerDate(date: string): Date {
  const [year, month, day] = parts(date)
  return new Date(year, month - 1, day)
}

/** The calendar date a picker's `Date` stands for (its local year, month and day). */
export function fromPickerDate(picked: Date): string {
  return format(picked, "yyyy-MM-dd")
}

/** The calendar date `days` days after `date` (before it when negative). */
export function addDays(date: string, days: number): string {
  // Calendar days on a local midnight, so a DST change in the device's zone cannot shift it.
  return format(addCalendarDays(toPickerDate(date), days), "yyyy-MM-dd")
}

/** A calendar date for display, e.g. "Nov 1, 2026". */
export function formatDisplayDate(date: string): string {
  return format(toPickerDate(date), "MMM d, yyyy")
}

// Counting days works on the date's UTC midnight, where no day is ever 23 or 25 hours long, so a
// DST change in any zone cannot shift it.
const DAY_MS = 86_400_000

function utcDay(date: string): number {
  const [year, month, day] = parts(date)
  return Date.UTC(year, month - 1, day)
}

function fromUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS)
}

/**
 * The same day `months` later, or that month's last day when it is shorter: Jan 31 + 1 month is
 * Feb 28 (29 in a leap year), and Feb 29 + 12 months is Feb 28.
 */
export function addMonthsClamped(date: string, months: number): string {
  const [year, month, day] = parts(date)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = index - targetYear * 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return fromUtcDay(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)))
}

/** The day of the month, 1 to 31. */
export function dayOfMonth(date: string): number {
  return parts(date)[2]
}

/** The weekday's name, e.g. "Friday". */
export function weekdayName(date: string): string {
  return format(toPickerDate(date), "EEEE")
}

/** A calendar date's month and day, e.g. "Mar 5". */
export function formatMonthDay(date: string): string {
  return format(toPickerDate(date), "MMM d")
}

// Calendar months are `YYYY-MM` strings.

/** The calendar month a calendar date falls in. */
export function monthOfDate(date: string): string {
  return date.slice(0, 7)
}

/** The household's calendar month right now. */
export function thisMonth(): string {
  return monthOfDate(today())
}

/** The calendar month `months` after `month` (before it when negative). */
export function shiftMonth(month: string, months: number): string {
  return addMonthsClamped(`${month}-01`, months).slice(0, 7)
}

/** A calendar month's first and last dates. */
export function monthDates(month: string): { first: string; last: string } {
  const first = `${month}-01`
  return { first, last: addDays(addMonthsClamped(first, 1), -1) }
}

/** A calendar month for display, e.g. "September 2026". */
export function formatMonth(month: string): string {
  return format(toPickerDate(`${month}-01`), "MMMM yyyy")
}

/** A calendar month's short name, e.g. "Sep". */
export function formatShortMonth(month: string): string {
  return format(toPickerDate(`${month}-01`), "MMM")
}

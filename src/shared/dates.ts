/**
 * The only module that imports date-fns. Calendar dates are `YYYY-MM-DD` strings with no zone;
 * instants are ISO-8601 UTC strings. "Today" and month boundaries use the household zone.
 * Never `new Date("YYYY-MM-DD")`: it parses as UTC midnight, the wrong day in New York.
 */
import { TZDate } from "@date-fns/tz"
import { addMonths, format } from "date-fns"

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

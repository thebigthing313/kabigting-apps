import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  addDays,
  addMonthsClamped,
  daysBetween,
  formatDisplayDate,
  formatMonth,
  formatShortMonth,
  fromPickerDate,
  HOUSEHOLD_ZONE,
  monthInstantRange,
  monthDates,
  monthOf,
  nowInstant,
  shiftMonth,
  toPickerDate,
  today,
  weekdayName,
} from "./dates.ts"

describe("addDays", () => {
  test("moves a calendar date across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01")
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31")
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29")
  })

  test("is unaffected by a DST change in any zone", () => {
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02")
    expect(addDays("2026-04-05", 1)).toBe("2026-04-06")
  })
})

test("unit tests run far from the household zone", () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Pacific/Auckland")
  expect(HOUSEHOLD_ZONE).toBe("America/New_York")
})

describe("today", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test("is the household calendar date, not the machine's", () => {
    // 03:30 UTC on 1 Nov is 23:30 on 31 Oct in New York (and midday 1 Nov in Auckland).
    vi.setSystemTime(Date.UTC(2026, 10, 1, 3, 30))
    expect(today()).toBe("2026-10-31")
  })

  test("turns over at household midnight", () => {
    vi.setSystemTime(Date.UTC(2026, 10, 1, 4, 0))
    expect(today()).toBe("2026-11-01")
  })
})

describe("monthInstantRange", () => {
  test("March 2026 starts on EST and ends on EDT (DST begins 2026-03-08)", () => {
    expect(monthInstantRange("2026-03")).toEqual({
      start: "2026-03-01T05:00:00.000Z",
      end: "2026-04-01T04:00:00.000Z",
    })
  })

  test("November 2026 starts on EDT and ends on EST (DST ends 2026-11-01)", () => {
    expect(monthInstantRange("2026-11")).toEqual({
      start: "2026-11-01T04:00:00.000Z",
      end: "2026-12-01T05:00:00.000Z",
    })
  })

  test("December rolls into the next year", () => {
    expect(monthInstantRange("2026-12").end).toBe("2027-01-01T05:00:00.000Z")
  })
})

describe("monthOf", () => {
  test.each([
    ["2026-11-01T03:59:59.999Z", "2026-10"],
    ["2026-11-01T04:00:00.000Z", "2026-11"],
    ["2026-03-01T04:59:59.999Z", "2026-02"],
    ["2026-03-01T05:00:00.000Z", "2026-03"],
  ])("puts %s in household month %s", (instant, month) => {
    expect(monthOf(instant)).toBe(month)
  })

  test("agrees with monthInstantRange's half-open boundaries", () => {
    const { start, end } = monthInstantRange("2026-11")
    expect(monthOf(start)).toBe("2026-11")
    expect(monthOf(end)).toBe("2026-12")
  })
})

describe("nowInstant", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test("is the current moment as ISO-8601 UTC", () => {
    vi.setSystemTime(Date.UTC(2026, 9, 14, 13, 5))
    expect(nowInstant()).toBe("2026-10-14T13:05:00.000Z")
  })
})

describe("date picker conversion", () => {
  test("a calendar date becomes local midnight of that day, whatever the zone", () => {
    const picked = toPickerDate("2026-03-08")
    expect([picked.getFullYear(), picked.getMonth(), picked.getDate(), picked.getHours()]).toEqual([
      2026, 2, 8, 0,
    ])
  })

  test("a picked day becomes its calendar date", () => {
    expect(fromPickerDate(new Date(2026, 10, 1, 23, 59))).toBe("2026-11-01")
  })

  test("round-trips across both DST changes", () => {
    for (const date of ["2026-03-08", "2026-11-01", "2026-12-31", "2028-02-29"]) {
      expect(fromPickerDate(toPickerDate(date))).toBe(date)
    }
  })
})

test("formatDisplayDate shows a calendar date without shifting it", () => {
  expect(formatDisplayDate("2026-11-01")).toBe("Nov 1, 2026")
})

describe("calendar arithmetic", () => {
  test("addDays crosses months, years and both DST changes without drifting", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08")
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09")
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01")
    expect(addDays("2026-11-01", 14)).toBe("2026-11-15")
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08")
    expect(addDays("2026-01-10", -14)).toBe("2025-12-27")
  })

  test("addMonthsClamped lands on the month's last day when the day is missing", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29")
    expect(addMonthsClamped("2026-01-31", 3)).toBe("2026-04-30")
    expect(addMonthsClamped("2026-01-15", 1)).toBe("2026-02-15")
    expect(addMonthsClamped("2026-11-30", 2)).toBe("2027-01-30")
    expect(addMonthsClamped("2028-02-29", 12)).toBe("2029-02-28")
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28")
  })

  test("daysBetween counts calendar days, negative when the second is earlier", () => {
    expect(daysBetween("2026-03-01", "2026-03-15")).toBe(14)
    expect(daysBetween("2026-10-25", "2026-11-08")).toBe(14)
    expect(daysBetween("2026-12-31", "2026-01-01")).toBe(-364)
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2)
  })

  test("weekdayName names the calendar date's day", () => {
    expect(weekdayName("2026-10-16")).toBe("Friday")
    expect(weekdayName("2026-11-01")).toBe("Sunday")
  })
})

describe("calendar months", () => {
  test("shiftMonth steps whole months across years", () => {
    expect(shiftMonth("2026-10", -1)).toBe("2026-09")
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
    expect(shiftMonth("2026-12", 1)).toBe("2027-01")
    expect(shiftMonth("2026-10", -13)).toBe("2025-09")
  })

  test("monthDates gives a month's first and last calendar dates", () => {
    expect(monthDates("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" })
    expect(monthDates("2028-02")).toEqual({ first: "2028-02-01", last: "2028-02-29" })
    expect(monthDates("2026-12")).toEqual({ first: "2026-12-01", last: "2026-12-31" })
  })

  test("formatMonth and formatShortMonth name the month", () => {
    expect(formatMonth("2026-09")).toBe("September 2026")
    expect(formatShortMonth("2026-09")).toBe("Sep")
  })
})

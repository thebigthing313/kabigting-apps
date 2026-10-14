import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  formatDisplayDate,
  fromPickerDate,
  HOUSEHOLD_ZONE,
  monthInstantRange,
  monthOf,
  nowInstant,
  toPickerDate,
  today,
} from "./dates.ts"

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

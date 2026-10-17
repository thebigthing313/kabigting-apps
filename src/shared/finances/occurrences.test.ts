import { describe, expect, test } from "vitest"
import {
  describeTerms,
  expandSchedule,
  isOccurrenceDate,
  nextOccurrence,
  storedEdit,
  type ScheduleTerms,
  type StoredOccurrence,
} from "./occurrences.ts"

/** A made-up rent Schedule; tests change only the terms they are about. */
function schedule(terms: Partial<ScheduleTerms> = {}): ScheduleTerms {
  return {
    unit: "month",
    every: 1,
    startDate: "2026-01-01",
    endDate: null,
    amountCents: -150_000,
    ...terms,
  }
}

const FAR_PAST = "2000-01-01"

function dates(terms: Partial<ScheduleTerms>, from: string, to: string) {
  return expandSchedule(schedule(terms), [], { from, to }, FAR_PAST).map((o) => o.date)
}

describe("monthly Schedules", () => {
  test("on the 31st fall on each month's last day and keep their anchor", () => {
    expect(dates({ startDate: "2026-01-31" }, "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ])
  })

  test("on the 30th fall on Feb 28, or Feb 29 in a leap year, then return to the 30th", () => {
    expect(dates({ startDate: "2027-12-30" }, "2028-01-01", "2028-03-31")).toEqual([
      "2028-01-30",
      "2028-02-29",
      "2028-03-30",
    ])
  })

  test("every 12 months on Feb 29 falls on Feb 28 in other years", () => {
    expect(dates({ startDate: "2028-02-29", every: 12 }, "2028-01-01", "2033-01-01")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
    ])
  })

  test("every 3 months skips the months between", () => {
    expect(dates({ startDate: "2026-01-15", every: 3 }, "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-15",
      "2026-04-15",
      "2026-07-15",
      "2026-10-15",
    ])
  })

  test("never shift for weekends: the 1st stays the 1st on a Sunday", () => {
    expect(dates({ startDate: "2026-01-01" }, "2026-11-01", "2026-11-01")).toEqual(["2026-11-01"])
  })

  test("a range years after the start still lands on the anchor day", () => {
    expect(dates({ startDate: "2026-01-31" }, "2040-02-01", "2040-03-31")).toEqual([
      "2040-02-29",
      "2040-03-31",
    ])
  })
})

describe("weekly Schedules", () => {
  test("every 2 weeks keeps its weekday across both DST changes", () => {
    expect(
      dates({ unit: "week", every: 2, startDate: "2026-02-27" }, "2026-02-01", "2026-03-31"),
    ).toEqual(["2026-02-27", "2026-03-13", "2026-03-27"])
    expect(
      dates({ unit: "week", every: 2, startDate: "2026-10-23" }, "2026-10-01", "2026-11-30"),
    ).toEqual(["2026-10-23", "2026-11-06", "2026-11-20"])
  })

  test("weekly crosses a year end", () => {
    expect(
      dates({ unit: "week", every: 1, startDate: "2026-12-18" }, "2026-12-20", "2027-01-10"),
    ).toEqual(["2026-12-25", "2027-01-01", "2027-01-08"])
  })
})

describe("start and end dates", () => {
  test("nothing falls before the start date", () => {
    expect(dates({ startDate: "2026-06-10" }, "2026-01-01", "2026-07-31")).toEqual([
      "2026-06-10",
      "2026-07-10",
    ])
  })

  test("the end date is inclusive", () => {
    expect(
      dates({ startDate: "2026-01-10", endDate: "2026-03-10" }, "2026-01-01", "2026-12-31"),
    ).toEqual(["2026-01-10", "2026-02-10", "2026-03-10"])
  })

  test("a range wholly after the end has nothing", () => {
    expect(dates({ endDate: "2026-03-31" }, "2026-04-01", "2026-12-31")).toEqual([])
  })
})

function stored(nominalDate: string, changes: Partial<StoredOccurrence> = {}): StoredOccurrence {
  return {
    nominalDate,
    overrideAmountCents: null,
    overrideDate: null,
    skipped: false,
    reconciledTransactionId: null,
    reconciledTransferId: null,
    ...changes,
  }
}

const MARCH = { from: "2026-03-01", to: "2026-03-31" }

describe("states", () => {
  test("before today is overdue; today and later is upcoming", () => {
    const weekly = schedule({ unit: "week", startDate: "2026-03-02" })
    expect(expandSchedule(weekly, [], MARCH, "2026-03-16").map((o) => [o.date, o.state])).toEqual([
      ["2026-03-02", "overdue"],
      ["2026-03-09", "overdue"],
      ["2026-03-16", "upcoming"],
      ["2026-03-23", "upcoming"],
      ["2026-03-30", "upcoming"],
    ])
  })

  test("a skipped Occurrence is skipped, even when its date has passed", () => {
    const [occurrence] = expandSchedule(
      schedule(),
      [stored("2026-03-01", { skipped: true })],
      MARCH,
      "2026-03-20",
    )
    expect(occurrence).toMatchObject({ nominalDate: "2026-03-01", state: "skipped" })
  })

  test("a Reconciled Occurrence is reconciled, never overdue", () => {
    const occurrences = expandSchedule(
      schedule(),
      [stored("2026-03-01", { reconciledTransactionId: "actual-1" })],
      MARCH,
      "2026-03-20",
    )
    expect(occurrences.map((o) => o.state)).toEqual(["reconciled"])
    const transfer = expandSchedule(
      schedule(),
      [stored("2026-03-01", { reconciledTransferId: "transfer-1" })],
      MARCH,
      "2026-03-20",
    )
    expect(transfer.map((o) => o.state)).toEqual(["reconciled"])
  })
})

describe("overrides", () => {
  test("an overridden amount and date replace the computed ones, counted once", () => {
    const occurrences = expandSchedule(
      schedule(),
      [stored("2026-03-01", { overrideAmountCents: -160_000, overrideDate: "2026-03-03" })],
      MARCH,
      FAR_PAST,
    )
    expect(occurrences).toEqual([
      { nominalDate: "2026-03-01", date: "2026-03-03", amountCents: -160_000, state: "upcoming" },
    ])
  })

  test("an override moved out of the range leaves it", () => {
    const occurrences = expandSchedule(
      schedule(),
      [stored("2026-03-01", { overrideDate: "2026-04-02" })],
      MARCH,
      FAR_PAST,
    )
    expect(occurrences).toEqual([])
  })

  test("an override moved into the range is included though its nominal date is outside", () => {
    const occurrences = expandSchedule(
      schedule(),
      [stored("2026-04-01", { overrideDate: "2026-03-30" })],
      MARCH,
      FAR_PAST,
    )
    expect(occurrences.map((o) => [o.nominalDate, o.date])).toEqual([
      ["2026-03-01", "2026-03-01"],
      ["2026-04-01", "2026-03-30"],
    ])
  })

  test("an overridden date decides overdue", () => {
    const [occurrence] = expandSchedule(
      schedule(),
      [stored("2026-03-01", { overrideDate: "2026-03-25" })],
      MARCH,
      "2026-03-20",
    )
    expect(occurrence).toMatchObject({ date: "2026-03-25", state: "upcoming" })
  })

  test("Occurrences come in date order", () => {
    const occurrences = expandSchedule(
      schedule({ unit: "week", startDate: "2026-03-02" }),
      [stored("2026-03-02", { overrideDate: "2026-03-10" })],
      MARCH,
      FAR_PAST,
    )
    expect(occurrences.map((o) => o.date)).toEqual([
      "2026-03-09",
      "2026-03-10",
      "2026-03-16",
      "2026-03-23",
      "2026-03-30",
    ])
  })

  test("a stored row outside the Schedule's dates is ignored", () => {
    const occurrences = expandSchedule(
      schedule({ startDate: "2026-03-01", endDate: "2026-03-31" }),
      [stored("2026-04-01", { overrideDate: "2026-03-15" })],
      MARCH,
      FAR_PAST,
    )
    expect(occurrences.map((o) => o.nominalDate)).toEqual(["2026-03-01"])
  })
})

describe("describeTerms", () => {
  test.each([
    [{ startDate: "2026-01-01" }, "Monthly on the 1st"],
    [{ startDate: "2026-01-02" }, "Monthly on the 2nd"],
    [{ startDate: "2026-01-03" }, "Monthly on the 3rd"],
    [{ startDate: "2026-01-11" }, "Monthly on the 11th"],
    [{ startDate: "2026-01-12" }, "Monthly on the 12th"],
    [{ startDate: "2026-01-13" }, "Monthly on the 13th"],
    [{ startDate: "2026-01-22" }, "Monthly on the 22nd"],
    [{ startDate: "2026-01-31" }, "Monthly on the 31st"],
    [{ startDate: "2026-01-15", every: 3 }, "Every 3 months on the 15th"],
    [{ startDate: "2026-03-05", every: 12 }, "Yearly on Mar 5"],
    [{ startDate: "2028-02-29", every: 24 }, "Every 2 years on Feb 29"],
    [{ unit: "week", startDate: "2026-10-16" }, "Weekly on Friday"],
    [{ unit: "week", every: 2, startDate: "2026-10-16" }, "Every 2 weeks on Friday"],
  ] as const)("%o reads %s", (terms, words) => {
    expect(describeTerms(schedule(terms))).toBe(words)
  })
})

describe("nextOccurrence", () => {
  test("is the first one dated today or later", () => {
    expect(nextOccurrence(schedule(), [], "2026-03-02")).toMatchObject({
      date: "2026-04-01",
      amountCents: -150_000,
    })
    expect(nextOccurrence(schedule(), [], "2026-04-01")?.date).toBe("2026-04-01")
  })

  test("before the start date is the start date", () => {
    expect(nextOccurrence(schedule({ startDate: "2027-06-30" }), [], "2026-03-02")?.date).toBe(
      "2027-06-30",
    )
  })

  test("passes over skipped and Reconciled ones and uses an override", () => {
    const next = nextOccurrence(
      schedule(),
      [
        stored("2026-04-01", { skipped: true }),
        stored("2026-05-01", { reconciledTransactionId: "actual-1" }),
        stored("2026-06-01", { overrideAmountCents: -1, overrideDate: "2026-06-03" }),
      ],
      "2026-03-02",
    )
    expect(next).toMatchObject({ nominalDate: "2026-06-01", date: "2026-06-03", amountCents: -1 })
  })

  test("finds a far-off yearly one", () => {
    expect(
      nextOccurrence(schedule({ startDate: "2024-02-29", every: 12 }), [], "2026-03-01")?.date,
    ).toBe("2027-02-28")
  })

  test("is null once the Schedule has ended", () => {
    expect(nextOccurrence(schedule({ endDate: "2026-02-28" }), [], "2026-03-02")).toBeNull()
  })
})

describe("isOccurrenceDate", () => {
  test("is true for a date the terms put an Occurrence on, within start and end", () => {
    const terms = schedule({ startDate: "2026-01-31", endDate: "2026-06-30" })
    expect(isOccurrenceDate(terms, "2026-02-28")).toBe(true)
    expect(isOccurrenceDate(terms, "2026-03-31")).toBe(true)
  })

  test("is false off the cadence, before the start or after the end", () => {
    const terms = schedule({ startDate: "2026-01-31", endDate: "2026-06-30" })
    expect(isOccurrenceDate(terms, "2026-03-30")).toBe(false)
    expect(isOccurrenceDate(terms, "2025-12-31")).toBe(false)
    expect(isOccurrenceDate(terms, "2026-07-31")).toBe(false)
  })
})

describe("storedEdit", () => {
  const rent = schedule({ startDate: "2026-01-01", amountCents: -150_000 })

  test("keeps only what differs from the Schedule's terms", () => {
    expect(
      storedEdit(rent, "2026-03-01", { amountCents: -160_000, date: "2026-03-01", skipped: false }),
    ).toEqual({ overrideAmountCents: -160_000, overrideDate: null, skipped: false })
    expect(
      storedEdit(rent, "2026-03-01", { amountCents: -150_000, date: "2026-03-04", skipped: true }),
    ).toEqual({ overrideAmountCents: null, overrideDate: "2026-03-04", skipped: true })
  })

  test("is null when the edit puts the Occurrence back on the Schedule's terms", () => {
    expect(
      storedEdit(rent, "2026-03-01", { amountCents: -150_000, date: "2026-03-01", skipped: false }),
    ).toBeNull()
  })
})

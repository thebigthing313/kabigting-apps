import { describe, expect, test } from "vitest"
import {
  categoryYear,
  countedUnder,
  isFarOverAverage,
  monthlySummary,
  summaryMonths,
  type SummaryActual,
  type SummaryCategory,
} from "./summary.ts"

const MONTH = "2026-09"

function category(id: string, changes: Partial<SummaryCategory> = {}): SummaryCategory {
  return { id, name: id, archived: false, mergedIntoId: null, ...changes }
}

const CATEGORIES = [category("Paycheck"), category("Groceries"), category("Shopping")]

let next = 0
/** A made-up Actual; tests change only what they are about. */
function actual(
  date: string,
  amountCents: number,
  categoryId: string | null,
  changes: Partial<SummaryActual> = {},
): SummaryActual {
  next += 1
  return {
    id: `actual-${next}`,
    status: "actual",
    ignored: false,
    date,
    amountCents,
    categoryId,
    ...changes,
  }
}

describe("monthlySummary", () => {
  test("a Category nets as income when positive and spending otherwise; refunds net inside it", () => {
    const summary = monthlySummary(
      [
        actual("2026-09-01", 300_000, "Paycheck"),
        actual("2026-09-03", -10_000, "Groceries"),
        actual("2026-09-04", -8_000, "Shopping"),
        // A refund bigger than the month's purchases makes Shopping income this month.
        actual("2026-09-20", 12_000, "Shopping"),
      ],
      CATEGORIES,
      MONTH,
    )

    expect(summary.income.map((line) => [line.name, line.monthCents])).toEqual([
      ["Paycheck", 300_000],
      ["Shopping", 4_000],
    ])
    expect(summary.spending.map((line) => [line.name, line.monthCents])).toEqual([
      ["Groceries", -10_000],
    ])
    expect(summary.totals.month).toEqual({
      incomeCents: 304_000,
      spendingCents: -10_000,
      netCents: 294_000,
    })
  })

  test("only Actuals count: Planned rows and ignored lines are left out", () => {
    const summary = monthlySummary(
      [
        actual("2026-09-03", -10_000, "Groceries"),
        actual("2026-09-05", -99_000, "Groceries", { status: "planned" }),
        actual("2026-09-06", -77_000, "Groceries", { ignored: true }),
      ],
      CATEGORIES,
      MONTH,
    )

    expect(summary.spending.map((line) => line.monthCents)).toEqual([-10_000])
    expect(summary.totals.month.spendingCents).toBe(-10_000)
  })

  test("last month and the 12-month average come from the months before, not this one", () => {
    const summary = monthlySummary(
      [
        // Thirteen months back: outside the average, but it places the first month.
        actual("2025-08-15", -1_000_000, "Groceries"),
        actual("2025-09-15", -12_000, "Groceries"),
        actual("2026-08-15", -24_000, "Groceries"),
        actual("2026-09-15", -50_000, "Groceries"),
      ],
      CATEGORIES,
      MONTH,
    )

    const [groceries] = summary.spending
    expect(groceries).toMatchObject({ monthCents: -50_000, lastMonthCents: -24_000 })
    // ($120 + $240) over all 12 months, since the history starts before them.
    expect(groceries!.averageCents).toBe(-3_000)
    expect(summary.totals.lastMonth.spendingCents).toBe(-24_000)
    expect(summary.totals.average).toEqual({
      incomeCents: 0,
      spendingCents: -3_000,
      netCents: -3_000,
    })
  })

  test("over a short history, the average divides by the months since the first Actual", () => {
    const summary = monthlySummary(
      [
        actual("2026-06-10", -9_000, "Groceries"),
        actual("2026-08-10", -3_000, "Groceries"),
        actual("2026-09-10", -1_000, "Groceries"),
      ],
      CATEGORIES,
      MONTH,
    )

    // June, July and August: $120 over 3 months.
    expect(summary.spending[0]!.averageCents).toBe(-4_000)
    expect(summary.firstMonth).toBe("2026-06")
  })

  test("in the first month with Actuals the average divides by 1", () => {
    const summary = monthlySummary([actual("2026-09-10", -1_000, "Groceries")], CATEGORIES, MONTH)

    expect(summary.spending[0]).toMatchObject({ monthCents: -1_000, averageCents: 0 })
    expect(summary.totals.average.netCents).toBe(0)
  })

  test("with no Actuals at all there are no lines and no first month", () => {
    const summary = monthlySummary([], CATEGORIES, MONTH)

    expect(summary).toMatchObject({
      firstMonth: null,
      income: [],
      spending: [],
      uncategorised: null,
    })
    expect(summary.totals.month).toEqual({ incomeCents: 0, spendingCents: 0, netCents: 0 })
  })

  test("a Category with Actuals only earlier in the window still shows, at $0 this month", () => {
    const summary = monthlySummary([actual("2026-03-10", -6_000, "Shopping")], CATEGORIES, MONTH)

    expect(summary.spending).toEqual([
      {
        categoryId: "Shopping",
        name: "Shopping",
        archived: false,
        monthCents: 0,
        lastMonthCents: 0,
        averageCents: -1_000,
      },
    ])
  })

  test("Uncategorised stands apart, and its net still counts by the sign rule", () => {
    const summary = monthlySummary(
      [actual("2026-09-10", -2_500, null), actual("2026-09-11", -1_000, "Groceries")],
      CATEGORIES,
      MONTH,
    )

    expect(summary.spending.map((line) => line.name)).toEqual(["Groceries"])
    expect(summary.uncategorised).toMatchObject({
      categoryId: null,
      name: "Uncategorised",
      monthCents: -2_500,
    })
    expect(summary.totals.month.spendingCents).toBe(-3_500)
  })

  test("merged Categories count under their target; archived ones with Actuals are marked", () => {
    const categories = [
      category("Groceries"),
      category("Market", { archived: true, mergedIntoId: "Food" }),
      category("Food", { archived: true, mergedIntoId: "Groceries" }),
      category("Hobbies", { archived: true }),
      category("Unused", { archived: true }),
    ]
    const summary = monthlySummary(
      [
        actual("2026-09-01", -1_000, "Groceries"),
        actual("2026-09-02", -2_000, "Market"),
        actual("2026-09-03", -3_000, "Food"),
        actual("2026-08-03", -4_000, "Hobbies"),
      ],
      categories,
      MONTH,
    )

    expect(summary.spending.map((line) => [line.name, line.archived, line.monthCents])).toEqual([
      ["Groceries", false, -6_000],
      ["Hobbies", true, 0],
    ])
  })

  test("spending lines run from the most spent; income lines from the most earned", () => {
    const summary = monthlySummary(
      [
        actual("2026-09-01", -1_000, "Groceries"),
        actual("2026-09-01", -5_000, "Shopping"),
        actual("2026-09-01", 2_000, "Paycheck"),
        actual("2026-09-01", 9_000, "Refunds"),
      ],
      [...CATEGORIES, category("Refunds")],
      MONTH,
    )

    expect(summary.spending.map((line) => line.name)).toEqual(["Shopping", "Groceries"])
    expect(summary.income.map((line) => line.name)).toEqual(["Refunds", "Paycheck"])
  })
})

describe("categoryYear", () => {
  test("gives 12 monthly bars ending at the month, and the summary's average", () => {
    const year = categoryYear(
      [
        // The household's first Actual, in another Category, places the first month.
        actual("2026-03-02", 500_000, "Paycheck"),
        actual("2026-05-10", -6_000, "Groceries"),
        actual("2026-05-20", 1_000, "Groceries"),
        actual("2026-08-04", -9_000, "Groceries"),
        actual("2026-09-01", -12_000, "Groceries"),
        actual("2026-09-02", -40_000, "Shopping"),
        actual("2026-09-03", -3_000, "Groceries", { status: "planned" }),
        actual("2026-09-04", -3_000, "Groceries", { ignored: true }),
      ],
      "Groceries",
      MONTH,
    )

    expect(year.bars.map((bar) => bar.month)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ])
    expect(year.bars.map((bar) => bar.cents)).toEqual([
      0, 0, 0, 0, 0, 0, 0, -5_000, 0, 0, -9_000, -12_000,
    ])
    // March to August is 6 months since the first Actual: (-5,000 - 9,000) / 6, rounded.
    expect(year.averageCents).toBe(-2_333)
  })

  test("Uncategorised is the null Category", () => {
    const year = categoryYear([actual("2026-09-05", -700, null)], null, MONTH)
    expect(year.bars.at(-1)).toEqual({ month: MONTH, cents: -700 })
    expect(year.averageCents).toBe(0)
  })

  test("Actuals of a merged Category count under its target once mapped by countedUnder", () => {
    const categories = [
      category("Groceries"),
      category("Food", { archived: true, mergedIntoId: "Groceries" }),
    ]
    const under = countedUnder(categories)
    const rows = [actual("2026-09-01", -1_000, "Food"), actual("2026-09-02", -2_000, "Groceries")]
    const year = categoryYear(
      rows.map((row) => ({ ...row, categoryId: under(row.categoryId) })),
      "Groceries",
      MONTH,
    )
    expect(year.bars.at(-1)?.cents).toBe(-3_000)
  })
})

describe("isFarOverAverage", () => {
  test("needs more than 25% over the average and at least $25 over", () => {
    // $200 against $150: 33% and $50 over.
    expect(isFarOverAverage({ monthCents: -20_000, averageCents: -15_000 })).toBe(true)
    // Exactly 25% over is not more than 25%.
    expect(isFarOverAverage({ monthCents: -18_750, averageCents: -15_000 })).toBe(false)
    // $40 against $20: double, but only $20 over.
    expect(isFarOverAverage({ monthCents: -4_000, averageCents: -2_000 })).toBe(false)
    // $25 over a $0 average.
    expect(isFarOverAverage({ monthCents: -2_500, averageCents: 0 })).toBe(true)
    // Under the average.
    expect(isFarOverAverage({ monthCents: -1_000, averageCents: -15_000 })).toBe(false)
    // A Category that usually earns, with nothing this month.
    expect(isFarOverAverage({ monthCents: 0, averageCents: 300_000 })).toBe(false)
    // Spending $30 where it usually earns: $30 over no usual spending.
    expect(isFarOverAverage({ monthCents: -3_000, averageCents: 300_000 })).toBe(true)
  })
})

describe("summaryMonths", () => {
  test("opens on last month and reaches back to the first month with Actuals", () => {
    expect(summaryMonths("2025-03", "2026-10")).toEqual({ earliest: "2025-03", shown: "2026-09" })
  })

  test("opens on this month when the first Actuals are this month's, or there are none", () => {
    expect(summaryMonths("2026-10", "2026-10")).toEqual({ earliest: "2026-10", shown: "2026-10" })
    expect(summaryMonths(undefined, "2026-10")).toEqual({ earliest: "2026-10", shown: "2026-10" })
  })

  test("shows a wanted month in reach, and the nearest one otherwise", () => {
    expect(summaryMonths("2025-03", "2026-10", "2025-07").shown).toBe("2025-07")
    expect(summaryMonths("2025-03", "2026-10", "2024-01").shown).toBe("2025-03")
    expect(summaryMonths("2025-03", "2026-10", "2027-01").shown).toBe("2026-10")
  })
})

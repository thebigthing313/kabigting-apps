import { describe, expect, test } from "vitest"
import { periodRange, spending, type SpendingExpense } from "./spending.ts"

// Made-up Members and Categories.
const GROCERIES = "groceries"
const DINING = "dining"
const TRAVEL = "travel"

function expense(overrides: Partial<SpendingExpense> & { id: string }): SpendingExpense {
  return {
    date: "2026-10-15",
    categoryId: GROCERIES,
    total: 9_000,
    owedShares: { ana: 3_000, ben: 3_000, cy: 3_000 },
    ...overrides,
  }
}

const ALL_TIME = periodRange("all-time", "2026-10-31")

describe("spending: Household", () => {
  test("totals each Category's Expense totals, largest first, with the period's total", () => {
    const result = spending(
      [
        expense({ id: "a", categoryId: GROCERIES, total: 9_000 }),
        expense({ id: "b", categoryId: DINING, total: 12_000 }),
        expense({ id: "c", categoryId: GROCERIES, total: 4_500 }),
      ],
      ALL_TIME,
      "household",
    )
    expect(result.total).toBe(25_500)
    expect(result.categories.map(({ categoryId, cents }) => [categoryId, cents])).toEqual([
      [GROCERIES, 13_500],
      [DINING, 12_000],
    ])
    expect(result.categories[0]?.expenses.map((each) => [each.expense.id, each.cents])).toEqual([
      ["a", 9_000],
      ["c", 4_500],
    ])
  })

  test("a Refund subtracts from its Category", () => {
    const result = spending(
      [
        expense({ id: "a", total: 9_000 }),
        expense({ id: "b", total: -3_000, owedShares: { ana: -1_500, ben: -1_500 } }),
      ],
      ALL_TIME,
      "household",
    )
    expect(result.total).toBe(6_000)
    expect(result.categories).toEqual([
      {
        categoryId: GROCERIES,
        cents: 6_000,
        expenses: [
          { expense: expect.objectContaining({ id: "a" }), cents: 9_000 },
          { expense: expect.objectContaining({ id: "b" }), cents: -3_000 },
        ],
      },
    ])
  })

  test("an Expense paid and owed by one Member still counts", () => {
    const result = spending(
      [expense({ id: "a", total: 2_000, owedShares: { ana: 2_000 } })],
      ALL_TIME,
      "household",
    )
    expect(result.total).toBe(2_000)
  })

  test("Categories with nothing in the period are left out", () => {
    const result = spending(
      [expense({ id: "a", categoryId: TRAVEL, date: "2025-01-10" })],
      periodRange("this-month", "2026-10-31"),
      "household",
    )
    expect(result).toEqual({ total: 0, categories: [] })
  })
})

describe("spending: My share", () => {
  test("counts only the Member's Owed shares, leaving out Expenses they don't owe in", () => {
    const result = spending(
      [
        expense({ id: "a", categoryId: GROCERIES, total: 9_000 }),
        expense({ id: "b", categoryId: DINING, total: 5_000, owedShares: { ben: 5_000 } }),
        expense({
          id: "c",
          categoryId: TRAVEL,
          total: 10_000,
          owedShares: { ana: 7_000, cy: 3_000 },
        }),
      ],
      ALL_TIME,
      { memberId: "ana" },
    )
    expect(result.total).toBe(10_000)
    expect(result.categories.map(({ categoryId, cents }) => [categoryId, cents])).toEqual([
      [TRAVEL, 7_000],
      [GROCERIES, 3_000],
    ])
  })

  test("a Refund nets the Member's share of it against the Category", () => {
    const result = spending(
      [
        expense({ id: "a", total: 9_000 }),
        expense({ id: "b", total: -3_000, owedShares: { ana: -1_500, ben: -1_500 } }),
      ],
      ALL_TIME,
      { memberId: "ana" },
    )
    expect(result.categories.map(({ cents }) => cents)).toEqual([1_500])
  })

  test("an Expense the Member paid and owes alone still counts", () => {
    const result = spending(
      [expense({ id: "a", total: 2_000, owedShares: { ana: 2_000 } })],
      ALL_TIME,
      { memberId: "ana" },
    )
    expect(result.total).toBe(2_000)
  })
})

describe("spending: periods", () => {
  const expenses = [
    expense({ id: "older", date: "2025-12-31", total: 1 }),
    expense({ id: "jan", date: "2026-01-01", total: 10 }),
    expense({ id: "jul", date: "2026-07-31", total: 100 }),
    expense({ id: "aug", date: "2026-08-01", total: 1_000 }),
    expense({ id: "sep", date: "2026-09-30", total: 10_000 }),
    expense({ id: "oct", date: "2026-10-01", total: 100_000 }),
    expense({ id: "later", date: "2026-10-31", total: 1_000_000 }),
  ]
  const totalFor = (period: Parameters<typeof periodRange>[0]) =>
    spending(expenses, periodRange(period, "2026-10-20"), "household").total

  test("each period covers whole calendar months around today", () => {
    expect(totalFor("this-month")).toBe(1_100_000)
    expect(totalFor("last-month")).toBe(10_000)
    expect(totalFor("last-3-months")).toBe(1_111_000)
    expect(totalFor("this-year")).toBe(1_111_110)
    expect(totalFor("all-time")).toBe(1_111_111)
  })

  test("the periods span year ends", () => {
    expect(periodRange("last-month", "2026-01-15")).toEqual({
      first: "2025-12-01",
      last: "2025-12-31",
    })
    expect(periodRange("last-3-months", "2026-02-15")).toEqual({
      first: "2025-12-01",
      last: "2026-02-28",
    })
  })
})

/**
 * Split's spending: what the household spent per Category over a period, either in Expense totals
 * (Household) or in one Member's Owed shares (My share). Only Expenses count: a Payment is never
 * spending. A Refund's negative total, or a Member's negative share of it, nets against its
 * Category. An Expense paid and owed by one Member counts like any other.
 */
import { monthDates, monthOfDate, shiftMonth } from "../dates.ts"
import type { Shares } from "./schemas.ts"

/** The spans the Spending tab offers, in the order it shows them. */
export const SPENDING_PERIODS = [
  "this-month",
  "last-month",
  "last-3-months",
  "this-year",
  "all-time",
] as const
export type SpendingPeriod = (typeof SPENDING_PERIODS)[number]

export const SPENDING_PERIOD_LABELS: Record<SpendingPeriod, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "last-3-months": "Last 3 months",
  "this-year": "This year",
  "all-time": "All time",
}

/** The span the Spending tab opens on. */
export const DEFAULT_SPENDING_PERIOD: SpendingPeriod = "last-3-months"

/** Calendar dates from `first` to `last`, both included; null is all time. */
export type DateRange = { first: string; last: string } | null

/**
 * A period's calendar dates, in whole months around `today`: Last 3 months is this month and the
 * two before it, and This year runs from January 1 to December 31.
 */
export function periodRange(period: SpendingPeriod, today: string): DateRange {
  const month = monthOfDate(today)
  if (period === "all-time") return null
  if (period === "this-month") return monthDates(month)
  if (period === "last-month") return monthDates(shiftMonth(month, -1))
  if (period === "last-3-months") {
    return { first: monthDates(shiftMonth(month, -2)).first, last: monthDates(month).last }
  }
  return { first: `${month.slice(0, 4)}-01-01`, last: `${month.slice(0, 4)}-12-31` }
}

/** Whose spending: the whole household's Expense totals, or one Member's Owed shares. */
export type SpendingScope = "household" | { memberId: string }

/** What spending reads from an Expense. */
export type SpendingExpense = {
  id: string
  date: string
  categoryId: string
  total: number
  owedShares: Shares
}

/** One Expense as it counts: its total, or the Member's Owed share of it. */
export type CountedExpense<E> = { expense: E; cents: number }

export type CategorySpending<E> = {
  categoryId: string
  cents: number
  /** The Expenses that count towards it, in the order given. */
  expenses: CountedExpense<E>[]
}

export type Spending<E> = {
  /** Every Category's cents added up. */
  total: number
  /** Only Categories with an Expense that counts, largest first. */
  categories: CategorySpending<E>[]
}

function countedCents(expense: SpendingExpense, scope: SpendingScope): number {
  return scope === "household" ? expense.total : (expense.owedShares[scope.memberId] ?? 0)
}

/**
 * Spending per Category over `range`. An Expense counts by its total for the household, or by the
 * Member's Owed share for My share, where one they owe nothing on is left out.
 */
export function spending<E extends SpendingExpense>(
  expenses: Iterable<E>,
  range: DateRange,
  scope: SpendingScope,
): Spending<E> {
  const byCategory = new Map<string, CategorySpending<E>>()
  for (const expense of expenses) {
    if (range && (expense.date < range.first || expense.date > range.last)) continue
    const cents = countedCents(expense, scope)
    if (cents === 0) continue
    const category = byCategory.get(expense.categoryId) ?? {
      categoryId: expense.categoryId,
      cents: 0,
      expenses: [],
    }
    category.cents += cents
    category.expenses.push({ expense, cents })
    byCategory.set(expense.categoryId, category)
  }
  const categories = [...byCategory.values()].toSorted((a, b) => b.cents - a.cents)
  return { total: categories.reduce((sum, category) => sum + category.cents, 0), categories }
}

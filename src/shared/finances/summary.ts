/**
 * The Monthly summary: one month's income, spending and net, and every Category's net, against
 * last month and the 12-month average. Only Actuals count; Planned rows and Transfers never do.
 */
import { shiftMonth } from "../dates.ts"
import { roundHalfUp } from "../money.ts"

export type SummaryActual = {
  id: string
  status: "planned" | "actual"
  ignored: boolean
  date: string
  amountCents: number
  categoryId: string | null
}

export type SummaryCategory = {
  id: string
  name: string
  archived: boolean
  mergedIntoId: string | null
}

/** Income is the sum of the Categories that net positive; spending is the rest. */
export type Figures = { incomeCents: number; spendingCents: number; netCents: number }

/** One Category's line, or Uncategorised's (`categoryId` null). */
export type SummaryLine = {
  categoryId: string | null
  name: string
  archived: boolean
  monthCents: number
  lastMonthCents: number
  averageCents: number
}

export type MonthlySummary = {
  month: string
  /** The first month with any Actual, or null when there are none. */
  firstMonth: string | null
  totals: { month: Figures; lastMonth: Figures; average: Figures }
  /** Categories that net positive this month, largest first. */
  income: SummaryLine[]
  /** Every other Category with Actuals in the window, biggest spending first. */
  spending: SummaryLine[]
  /** Actuals with no Category, or null when the window has none. */
  uncategorised: SummaryLine | null
}

/** The number of months before the summary month that the average covers. */
export const AVERAGE_MONTHS = 12

const UNCATEGORISED = "Uncategorised"

/** A merged Category counts under the one it was merged into, following a chain of merges. */
function resolver(categories: readonly SummaryCategory[]) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  return (id: string | null): string | null => {
    let current = id
    const seen = new Set<string>()
    while (current !== null && !seen.has(current)) {
      seen.add(current)
      const target = byId.get(current)?.mergedIntoId ?? null
      if (target === null) break
      current = target
    }
    return current
  }
}

function byName(a: SummaryLine, b: SummaryLine): number {
  return a.name.localeCompare(b.name)
}

function figures(nets: Iterable<number>): Figures {
  let incomeCents = 0
  let spendingCents = 0
  for (const net of nets) {
    if (net > 0) incomeCents += net
    else spendingCents += net
  }
  return { incomeCents, spendingCents, netCents: incomeCents + spendingCents }
}

/**
 * The summary for `month` (`YYYY-MM`) from the Actuals in it and the 12 months before it. The 12
 * months before it give the average, which divides by the months among them on or after the first
 * month with any Actual (at least 1). `actuals` may hold older rows too, such as the very first
 * Actual, which only places that first month.
 */
export function monthlySummary(
  actuals: readonly SummaryActual[],
  categories: readonly SummaryCategory[],
  month: string,
): MonthlySummary {
  const counted = actuals.filter((row) => row.status === "actual" && !row.ignored)
  const firstMonth = counted.reduce<string | null>((first, row) => {
    const rowMonth = row.date.slice(0, 7)
    return first === null || rowMonth < first ? rowMonth : first
  }, null)

  const lastMonth = shiftMonth(month, -1)
  const windowStart = shiftMonth(month, -AVERAGE_MONTHS)
  const averaged = Array.from({ length: AVERAGE_MONTHS }, (_, index) =>
    shiftMonth(windowStart, index),
  ).filter((m) => firstMonth !== null && m >= firstMonth)
  const divisor = Math.max(1, averaged.length)

  // Net per month, per Category (null for Uncategorised).
  const target = resolver(categories)
  const nets = new Map<string, Map<string | null, number>>()
  for (const row of counted) {
    const rowMonth = row.date.slice(0, 7)
    if (rowMonth < windowStart || rowMonth > month) continue
    const byCategory = nets.get(rowMonth) ?? new Map<string | null, number>()
    const id = target(row.categoryId)
    byCategory.set(id, (byCategory.get(id) ?? 0) + row.amountCents)
    nets.set(rowMonth, byCategory)
  }
  const netOf = (m: string, id: string | null) => nets.get(m)?.get(id) ?? 0
  const average = (values: number[]) =>
    roundHalfUp(values.reduce((sum, value) => sum + value, 0) / divisor)

  const ids = new Set<string | null>()
  for (const byCategory of nets.values()) for (const id of byCategory.keys()) ids.add(id)

  const byId = new Map(categories.map((category) => [category.id, category]))
  const lines = [...ids].map((id): SummaryLine => ({
    categoryId: id,
    name: id === null ? UNCATEGORISED : (byId.get(id)?.name ?? UNCATEGORISED),
    archived: id === null ? false : (byId.get(id)?.archived ?? false),
    monthCents: netOf(month, id),
    lastMonthCents: netOf(lastMonth, id),
    averageCents: average(averaged.map((m) => netOf(m, id))),
  }))
  const named = lines.filter((line) => line.categoryId !== null)

  const monthFigures = (m: string) => figures(nets.get(m)?.values() ?? [])
  const perMonth = averaged.map(monthFigures)
  return {
    month,
    firstMonth,
    totals: {
      month: monthFigures(month),
      lastMonth: monthFigures(lastMonth),
      average: {
        incomeCents: average(perMonth.map((f) => f.incomeCents)),
        spendingCents: average(perMonth.map((f) => f.spendingCents)),
        netCents: average(perMonth.map((f) => f.netCents)),
      },
    },
    income: named
      .filter((line) => line.monthCents > 0)
      .toSorted((a, b) => b.monthCents - a.monthCents || byName(a, b)),
    spending: named
      .filter((line) => line.monthCents <= 0)
      .toSorted(
        (a, b) => a.monthCents - b.monthCents || a.averageCents - b.averageCents || byName(a, b),
      ),
    uncategorised: lines.find((line) => line.categoryId === null) ?? null,
  }
}

/**
 * A spending bar is highlighted when the month spent more than 25% over its 12-month average and
 * at least $25 over it.
 */
export function isFarOverAverage(line: Pick<SummaryLine, "monthCents" | "averageCents">): boolean {
  const spent = -line.monthCents
  const usual = -line.averageCents
  return spent - usual >= 2_500 && spent * 4 > usual * 5
}

/**
 * The months the summary can show: from the first month with Actuals (this month when there are
 * none) to this month. It opens on last month, or on the first month when that is later.
 */
export function summaryMonths(firstMonth: string | undefined, thisMonth: string) {
  const earliest = firstMonth === undefined || firstMonth > thisMonth ? thisMonth : firstMonth
  const lastMonth = shiftMonth(thisMonth, -1)
  return { earliest, opening: lastMonth < earliest ? earliest : lastMonth }
}

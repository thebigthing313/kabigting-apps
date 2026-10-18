/**
 * The Monthly summary: one month's income, spending and net, and every Category's net, against
 * last month and the 12-month average. Only Actuals count; Planned rows and Transfers never do.
 */
import { monthOfDate, shiftMonth } from "../dates.ts"
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

/**
 * Maps a Category id to the one its Actuals count under: a merged Category counts under the one
 * it was merged into, following a chain of merges. Uncategorised (null) stays null.
 */
export function countedUnder(categories: readonly SummaryCategory[]) {
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
 * The Actuals that count (ignored lines and Planned rows never do), the first month with any of
 * them, and the months before `month` that its average covers: the 12 before it, from the first
 * month on. The average divides by their number, at least 1.
 */
function averageWindow(actuals: readonly SummaryActual[], month: string) {
  const counted = actuals.filter((row) => row.status === "actual" && !row.ignored)
  const firstMonth = counted.reduce<string | null>((first, row) => {
    const rowMonth = monthOfDate(row.date)
    return first === null || rowMonth < first ? rowMonth : first
  }, null)
  const windowStart = shiftMonth(month, -AVERAGE_MONTHS)
  const averaged = Array.from({ length: AVERAGE_MONTHS }, (_, index) =>
    shiftMonth(windowStart, index),
  ).filter((m) => firstMonth !== null && m >= firstMonth)
  return { counted, firstMonth, windowStart, averaged, divisor: Math.max(1, averaged.length) }
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
  const { counted, firstMonth, windowStart, averaged, divisor } = averageWindow(actuals, month)
  const lastMonth = shiftMonth(month, -1)

  // Net per month, per Category (null for Uncategorised).
  const byId = new Map(categories.map((category) => [category.id, category]))
  const under = countedUnder(categories)
  const nets = new Map<string, Map<string | null, number>>()
  for (const row of counted) {
    const rowMonth = monthOfDate(row.date)
    if (rowMonth < windowStart || rowMonth > month) continue
    const byCategory = nets.get(rowMonth) ?? new Map<string | null, number>()
    const id = under(row.categoryId)
    byCategory.set(id, (byCategory.get(id) ?? 0) + row.amountCents)
    nets.set(rowMonth, byCategory)
  }
  const netOf = (m: string, id: string | null) => nets.get(m)?.get(id) ?? 0
  const average = (values: number[]) =>
    roundHalfUp(values.reduce((sum, value) => sum + value, 0) / divisor)

  const ids = new Set<string | null>()
  for (const byCategory of nets.values()) for (const id of byCategory.keys()) ids.add(id)

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

/** One month's net for a Category on its page. */
export type CategoryBar = { month: string; cents: number }

/** A Category's year: 12 monthly bars ending at its month, and the 12-month average. */
export type CategoryYear = { bars: CategoryBar[]; averageCents: number }

/**
 * The 12 monthly nets of one Category (`null` for Uncategorised) ending at `month`, and its
 * average, the same as the summary's: over the 12 months before `month`, from the household's
 * first month with Actuals. Pass every Actual, as for `monthlySummary`, with each `categoryId`
 * already mapped through `countedUnder` when merged Categories should count under their target.
 */
export function categoryYear(
  actuals: readonly SummaryActual[],
  categoryId: string | null,
  month: string,
): CategoryYear {
  const { counted, windowStart, averaged, divisor } = averageWindow(actuals, month)
  const nets = new Map<string, number>()
  for (const row of counted) {
    const rowMonth = monthOfDate(row.date)
    if (row.categoryId !== categoryId || rowMonth < windowStart || rowMonth > month) continue
    nets.set(rowMonth, (nets.get(rowMonth) ?? 0) + row.amountCents)
  }
  const bars = Array.from({ length: AVERAGE_MONTHS }, (_, index) => {
    const barMonth = shiftMonth(month, index - (AVERAGE_MONTHS - 1))
    return { month: barMonth, cents: nets.get(barMonth) ?? 0 }
  })
  const total = averaged.reduce((sum, m) => sum + (nets.get(m) ?? 0), 0)
  return { bars, averageCents: roundHalfUp(total / divisor) }
}

/**
 * A spending bar is highlighted when the month spent more than 25% over its 12-month average and
 * at least $25 over it. A month that spent nothing is never highlighted.
 */
export function isFarOverAverage(line: Pick<SummaryLine, "monthCents" | "averageCents">): boolean {
  const spent = -line.monthCents
  // An average that earns money is no usual spending at all.
  const usual = Math.max(0, -line.averageCents)
  return spent - usual >= 2_500 && spent * 4 > usual * 5
}

/**
 * The months the summary can show run from the first month with Actuals (this month when there
 * are none) to this month. It opens on last month, or on the first month when that is later, and a
 * wanted month out of reach shows the nearest one there is.
 */
export function summaryMonths(
  firstMonth: string | undefined,
  thisMonth: string,
  wanted?: string,
): { earliest: string; shown: string } {
  const earliest = firstMonth === undefined || firstMonth > thisMonth ? thisMonth : firstMonth
  const month = wanted ?? shiftMonth(thisMonth, -1)
  return { earliest, shown: month < earliest ? earliest : month > thisMonth ? thisMonth : month }
}

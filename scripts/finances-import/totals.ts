/**
 * Old and new monthly totals per Category, side by side (spec §8). "Old" sums the extract's rows
 * directly with the Category mapping applied; "new" is the Monthly summary over the Actuals the
 * import would write. Any difference fails the run.
 */
import { monthOfDate } from "#shared/dates.ts"
import { monthlySummary, type SummaryActual } from "#shared/finances/summary.ts"
import { CATEGORY_NAMES, mapOldCategory } from "./categories.ts"
import type { Extract, Kind } from "./extract.ts"

/** One Category's net in one month; `category` null is Uncategorised. */
export type CategoryTotal = {
  month: string
  category: string | null
  oldCents: number
  newCents: number
}

type NewActual = { date: string; amountCents: number; category: string | null }

const cellKey = (month: string, category: string | null) => `${month}|${category ?? ""}`

function sign(kind: Kind, cents: number): number {
  return kind === "expense" ? -cents : cents
}

const plausible = (date: string | null): date is string =>
  date !== null && Number(date.slice(0, 4)) >= 1900 && Number(date.slice(0, 4)) <= 2999

/** The old monthly nets, straight from the extract: ledger rows, then unlinked transactions. */
function oldTotals(extract: Extract, today: string): Map<string, number> {
  const categoryName = new Map(extract.categories.map((c) => [c.id, c.name]))
  const mapped = (id: string | null) => {
    const name = id === null ? undefined : categoryName.get(id)
    return name === undefined ? null : (mapOldCategory(name) ?? null)
  }
  const transactions = new Map(extract.transactions.map((t) => [`${t.kind}:${t.id}`, t]))
  const schedules = new Map(extract.schedules.map((s) => [`${s.kind}:${s.id}`, s]))
  const linked = new Set<string>()
  const totals = new Map<string, number>()
  const add = (date: string, category: string | null, cents: number) => {
    const key = cellKey(monthOfDate(date), category)
    totals.set(key, (totals.get(key) ?? 0) + cents)
  }

  for (const row of extract.ledger) {
    const kind: Kind = row.isExpense ? "expense" : "income"
    const link = row.transactionId === null ? null : `${kind}:${row.transactionId}`
    if (link !== null) linked.add(link)
    if (row.amountCents === 0) continue
    if (
      (row.date !== null && !plausible(row.date)) ||
      (row.bankDate !== null && !plausible(row.bankDate))
    ) {
      continue
    }
    const linkedDate = link === null ? null : (transactions.get(link)?.date ?? null)
    const date = row.bankDate ?? row.date ?? (plausible(linkedDate) ? linkedDate : null)
    if (date === null) continue
    add(date, mapped(row.categoryId), sign(kind, row.amountCents))
  }
  for (const row of extract.transactions) {
    const key = `${row.kind}:${row.id}`
    if (linked.has(key) || row.amountCents === 0 || !plausible(row.date) || row.date > today) {
      continue
    }
    const schedule =
      row.scheduleId === null ? undefined : schedules.get(`${row.kind}:${row.scheduleId}`)
    add(row.date, mapped(schedule?.categoryId ?? null), sign(row.kind, row.amountCents))
  }
  return totals
}

/** The new monthly nets, as the Monthly summary shows them. */
function newTotals(actuals: readonly NewActual[]): Map<string, number> {
  const rows: SummaryActual[] = actuals.map((actual, index) => ({
    id: String(index),
    status: "actual",
    ignored: false,
    date: actual.date,
    amountCents: actual.amountCents,
    categoryId: actual.category,
  }))
  const categories = CATEGORY_NAMES.map((name) => ({
    id: name,
    name,
    archived: false,
    mergedIntoId: null,
  }))
  const months = new Set(actuals.map((actual) => monthOfDate(actual.date)))
  const totals = new Map<string, number>()
  for (const month of months) {
    const summary = monthlySummary(rows, categories, month)
    const lines = [
      ...summary.income,
      ...summary.spending,
      ...(summary.uncategorised ? [summary.uncategorised] : []),
    ]
    for (const line of lines) {
      if (line.monthCents !== 0) totals.set(cellKey(month, line.categoryId), line.monthCents)
    }
  }
  return totals
}

/** Every month and Category with a non-zero old or new total, oldest month first. */
export function categoryTotals(
  extract: Extract,
  actuals: readonly NewActual[],
  options: { today: string },
): CategoryTotal[] {
  const before = oldTotals(extract, options.today)
  const after = newTotals(actuals)
  const keys = new Set([...before.keys(), ...after.keys()])
  return [...keys]
    .map((key) => {
      const [month = "", category = ""] = key.split("|")
      return {
        month,
        category: category === "" ? null : category,
        oldCents: before.get(key) ?? 0,
        newCents: after.get(key) ?? 0,
      }
    })
    .filter((total) => total.oldCents !== 0 || total.newCents !== 0)
    .toSorted(
      (a, b) =>
        a.month.localeCompare(b.month) || (a.category ?? "~").localeCompare(b.category ?? "~"),
    )
}

// PROTOTYPE, throwaway: the sums behind the Balance and Category summaries, over the in-memory
// store. "Household" spending is each Expense's total; "My share" is the viewer's Owed share.
// Payments are never spending. A Refund (a negative total) nets against its Category.
import { monthDates, monthOfDate, shiftMonth, thisMonth, today } from "@shared/dates"
import { CATEGORIES, type Entry, type Expense, MEMBERS } from "@/apps/split/prototype/store"

export type Period = { key: string; label: string; first: string; last: string }

export function periods(): Period[] {
  const month = thisMonth()
  const last = shiftMonth(month, -1)
  return [
    { key: "month", label: "This month", first: monthDates(month).first, last: today() },
    { key: "last", label: "Last month", ...monthDates(last) },
    {
      key: "3m",
      label: "Last 3 months",
      first: monthDates(shiftMonth(month, -2)).first,
      last: today(),
    },
    { key: "year", label: "This year", first: `${month.slice(0, 4)}-01-01`, last: today() },
    { key: "all", label: "All time", first: "0000-01-01", last: "9999-12-31" },
  ]
}

export function expensesIn(entries: Entry[], first: string, last: string): Expense[] {
  return entries.filter(
    (entry): entry is Expense =>
      entry.kind === "expense" && entry.date >= first && entry.date <= last,
  )
}

/** Cents an Expense counts for: its total, or only the viewer's Owed share. */
export function counted(expense: Expense, viewerId: string | null): number {
  return viewerId === null ? expense.total : (expense.owedShares[viewerId] ?? 0)
}

export type CategoryTotal = { categoryId: string; name: string; cents: number; count: number }

/** Every Category with spending in the Expenses, largest first. */
export function byCategory(expenses: Expense[], viewerId: string | null): CategoryTotal[] {
  return CATEGORIES.map((category) => {
    const mine = expenses.filter((e) => e.categoryId === category.id && counted(e, viewerId) !== 0)
    return {
      categoryId: category.id,
      name: category.name,
      cents: mine.reduce((sum, e) => sum + counted(e, viewerId), 0),
      count: mine.length,
    }
  })
    .filter((total) => total.count > 0)
    .toSorted((a, b) => b.cents - a.cents)
}

/** The months from `first` to `last` inclusive, as `YYYY-MM`. */
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = []
  for (let m = first; m <= last; m = shiftMonth(m, 1)) months.push(m)
  return months
}

/** The months the store has any Entry in. */
export function activeMonths(entries: Entry[]): string[] {
  const dates = entries.map((e) => monthOfDate(e.date)).toSorted()
  return dates.length === 0 ? [thisMonth()] : monthsBetween(dates[0]!, thisMonth())
}

export type BalanceParts = {
  paid: number
  owed: number
  sent: number
  received: number
  balance: number
}

/** The four sums that make each Member's Balance, so the arithmetic can be shown. */
export function balanceParts(entries: Entry[]): Record<string, BalanceParts> {
  const parts: Record<string, BalanceParts> = Object.fromEntries(
    MEMBERS.map((m) => [m.id, { paid: 0, owed: 0, sent: 0, received: 0, balance: 0 }]),
  )
  for (const entry of entries) {
    if (entry.kind === "payment") {
      parts[entry.fromId]!.sent += entry.amount
      parts[entry.toId]!.received += entry.amount
    } else {
      for (const [id, c] of Object.entries(entry.paidShares)) parts[id]!.paid += c
      for (const [id, c] of Object.entries(entry.owedShares)) parts[id]!.owed += c
    }
  }
  for (const p of Object.values(parts)) p.balance = p.paid - p.owed + p.sent - p.received
  return parts
}

/** Each Member's Balance at the end of every month, for a history line. */
export function balanceHistory(entries: Entry[]): Array<Record<string, number | string>> {
  const running: Record<string, number> = Object.fromEntries(MEMBERS.map((m) => [m.id, 0]))
  const sorted = entries.toSorted((a, b) => a.date.localeCompare(b.date))
  return activeMonths(entries).map((month) => {
    for (const entry of sorted.filter((e) => monthOfDate(e.date) === month)) {
      if (entry.kind === "payment") {
        running[entry.fromId]! += entry.amount
        running[entry.toId]! -= entry.amount
      } else {
        for (const [id, c] of Object.entries(entry.paidShares)) running[id]! += c
        for (const [id, c] of Object.entries(entry.owedShares)) running[id]! -= c
      }
    }
    return { month, ...running }
  })
}

/**
 * OPEN QUESTION, shown in Variant A only: one way to reach zero from the overall Balances, the
 * fewest Payments by pairing the biggest debtor with the biggest creditor. It is a suggestion to
 * prefill the Payment form, never stored, and it isn't pairwise "who owes whom".
 */
export function suggestedPayments(
  balances: Record<string, number>,
): Array<{ fromId: string; toId: string; amount: number }> {
  const owe = Object.entries(balances)
    .filter(([, c]) => c < 0)
    .map(([id, c]) => ({ id, left: -c }))
  const owed = Object.entries(balances)
    .filter(([, c]) => c > 0)
    .map(([id, c]) => ({ id, left: c }))
  const out: Array<{ fromId: string; toId: string; amount: number }> = []
  while (owe.length > 0 && owed.length > 0) {
    owe.sort((a, b) => b.left - a.left)
    owed.sort((a, b) => b.left - a.left)
    const from = owe[0]!
    const to = owed[0]!
    const amount = Math.min(from.left, to.left)
    out.push({ fromId: from.id, toId: to.id, amount })
    from.left -= amount
    to.left -= amount
    if (from.left === 0) owe.shift()
    if (to.left === 0) owed.shift()
  }
  return out
}

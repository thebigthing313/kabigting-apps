/** Small rules about old rows that the mapping and the totals check share. */
import type { Kind, OldLedgerRow } from "./extract.ts"

/** Stored old amounts are unsigned by kind: an expense is money out, and a negative one money in. */
export function signed(kind: Kind, storedCents: number): number {
  const cents = kind === "expense" ? -storedCents : storedCents
  return cents === 0 ? 0 : cents
}

/** The kind of transaction a ledger row's link points into. */
export function kindOf(row: OldLedgerRow): Kind {
  return row.isExpense ? "expense" : "income"
}

/** Expense and income rows number their ids separately, so a reference names both. */
export function ref(kind: Kind, id: string): string {
  return `${kind}:${id}`
}

/** A date whose year is plausible; impossible years (typing slips) are dropped. */
export function hasPlausibleYear(date: string | null): date is string {
  if (date === null) return false
  const year = Number(date.slice(0, 4))
  return year >= 1900 && year <= 2999
}

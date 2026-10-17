/**
 * Balance checks: a Wallet's posted end-of-day balance on a date, as the bank shows it. Balances
 * are computed from the latest check forward; nothing is ever adjusted to match one.
 */
type Dated = { date: string; amountCents: number }

function sumBetween(actuals: readonly Dated[], after: string, through?: string): number {
  return actuals
    .filter((actual) => actual.date > after && (through === undefined || actual.date <= through))
    .reduce((total, actual) => total + actual.amountCents, 0)
}

/** A Wallet's balance now: its latest check plus every Actual dated after that check. */
export function balanceSince(check: Dated, actuals: readonly Dated[]): number {
  return check.amountCents + sumBetween(actuals, check.date)
}

/**
 * What a check should have read (the previous check plus the Actuals between, through the
 * check's date) and how far the bank's figure is off it. Null for a Wallet's first check.
 */
export function compareToComputed(
  check: Dated,
  previous: Dated | undefined,
  actuals: readonly Dated[],
): { computedCents: number; offByCents: number } | null {
  if (!previous) return null
  const computedCents = previous.amountCents + sumBetween(actuals, previous.date, check.date)
  return { computedCents, offByCents: check.amountCents - computedCents }
}

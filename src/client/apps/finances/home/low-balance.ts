/**
 * How a Wallet's low-balance threshold and low point read. On a Wallet shown as owed they talk
 * about what is owed; the stored threshold and when it fires stay the same.
 */
import { formatDisplayDate } from "@shared/dates"
import { formatShown, toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

type LowBalanceWallet = { shownAsOwed: boolean; lowBalanceThresholdCents: number }

/** The warning for the first day past the Wallet's threshold. */
export function thresholdWarning(wallet: LowBalanceWallet, date: string): string {
  const threshold = wallet.lowBalanceThresholdCents
  return wallet.shownAsOwed
    ? `Owes more than ${format(toShown(wallet, threshold))} on ${formatDisplayDate(date)}`
    : `Under the ${formatShown(wallet, threshold)} threshold on ${formatDisplayDate(date)}`
}

/** The Forecast's low point, the most owed on a Wallet shown as owed. */
export function lowPoint(
  wallet: LowBalanceWallet,
  low: { date: string; balanceCents: number },
): string {
  // "Most owed" already says owed, so the amount is not written "$X owed".
  return wallet.shownAsOwed
    ? `Most owed ${format(toShown(wallet, low.balanceCents))} on ${formatDisplayDate(low.date)}`
    : `Lowest ${formatShown(wallet, low.balanceCents)} on ${formatDisplayDate(low.date)}`
}

/** What a low-balance attention item is about, over the horizon of `days`. */
export function lowBalanceDetail(wallet: LowBalanceWallet, days: number): string {
  return `${wallet.shownAsOwed ? "Owed" : "Low balance"} in the next ${days} days`
}

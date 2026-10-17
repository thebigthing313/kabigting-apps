import type { Schedule } from "@/data/finances-schedules"
import { toShown } from "@shared/finances/wallets"

/** The Account, or "Transfer to <Wallet>" for a Transfer. */
export function scheduleLabel(
  schedule: Schedule,
  walletName: ReadonlyMap<string, string>,
  accountName: ReadonlyMap<string, string>,
): string {
  if (schedule.toWalletId !== null) {
    return `Transfer to ${walletName.get(schedule.toWalletId) ?? "another Wallet"}`
  }
  const account = schedule.accountId === null ? undefined : accountName.get(schedule.accountId)
  return account ?? (schedule.note || "No Account")
}

/**
 * An Occurrence's amount as the Wallet the Schedule draws on shows it: a Transfer is money out of
 * that Wallet, and a Wallet shown as owed flips the sign (D15).
 */
export function shownOnWallet(
  schedule: Pick<Schedule, "toWalletId">,
  wallet: { shownAsOwed: boolean },
  cents: number,
): number {
  return toShown(wallet, schedule.toWalletId === null ? cents : -cents)
}

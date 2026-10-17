import type { Schedule } from "@/data/finances-schedules"
import { toShown } from "@shared/finances/wallets"

/**
 * The Account, else the note, else "No Account". A Transfer is named by the other Wallet as seen
 * from `onWalletId`: "Transfer to <Wallet>" from the Wallet it draws on (the default), "Transfer
 * from <Wallet>" from the Wallet it pays into.
 */
export function scheduleLabel(
  schedule: Pick<Schedule, "walletId" | "toWalletId" | "accountId" | "note">,
  walletName: ReadonlyMap<string, string>,
  accountName: ReadonlyMap<string, string>,
  onWalletId: string = schedule.walletId,
): string {
  if (schedule.toWalletId !== null) {
    if (onWalletId === schedule.toWalletId) {
      return `Transfer from ${walletName.get(schedule.walletId) ?? "another Wallet"}`
    }
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

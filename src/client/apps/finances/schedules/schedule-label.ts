import type { Schedule } from "@/data/finances-schedules"

/**
 * What a Schedule is called: its Account, else its note, else "No Account". A Transfer is named
 * by the other Wallet, as seen from `onWalletId` (its from Wallet unless given).
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

/**
 * Transfers: money moved between two of the household's Wallets. The stored amount is positive,
 * moved from `fromWalletId` to `toWalletId`; each Wallet sees it with its own sign.
 */
type TransferMove = { fromWalletId: string; toWalletId: string; amountCents: number }

/** How a Transfer moves this Wallet: out of the from Wallet, into the to Wallet, 0 elsewhere. */
export function transferAmountOn(transfer: TransferMove, walletId: string): number {
  if (transfer.fromWalletId === walletId) return -transfer.amountCents
  return transfer.toWalletId === walletId ? transfer.amountCents : 0
}

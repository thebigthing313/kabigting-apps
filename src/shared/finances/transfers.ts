/**
 * Transfers: money moved between two of the household's Wallets. The stored amount is positive,
 * moved from `fromWalletId` to `toWalletId`; each Wallet sees it with its own sign.
 */
import { isImported, type TransferRow } from "./schemas.ts"

type TransferMove = { fromWalletId: string; toWalletId: string; amountCents: number }

/** How a Transfer moves this Wallet: out of the from Wallet, into the to Wallet, 0 elsewhere. */
export function transferAmountOn(transfer: TransferMove, walletId: string): number {
  if (transfer.fromWalletId === walletId) return -transfer.amountCents
  return transfer.toWalletId === walletId ? transfer.amountCents : 0
}

/** One side of a Transfer: the Wallet money left, or the one it reached. */
export type TransferSide = "from" | "to"

/**
 * The one side of an Actual Transfer whose bank line has arrived, while the other side's line is
 * still to come; null when both or neither have. Only a line from the bank or the old ledger keys
 * a side, so a Transfer entered by hand never waits. An ignored Transfer waits for nothing.
 */
export function onlySideArrived(
  transfer: Pick<TransferRow, "status" | "ignored" | "fromSource" | "toSource">,
): TransferSide | null {
  if (transfer.status !== "actual" || transfer.ignored) return null
  const from = isImported({ source: transfer.fromSource })
  const to = isImported({ source: transfer.toSource })
  if (from === to) return null
  return from ? "from" : "to"
}

/** The side across from this one. */
export function otherSide(side: TransferSide): TransferSide {
  return side === "from" ? "to" : "from"
}

/** The bank's description of the line on the given side, if one arrived there. */
export function bankDescriptionOn(
  transfer: Pick<TransferRow, "fromBankDescription" | "toBankDescription">,
  side: TransferSide,
): string | null {
  return side === "from" ? transfer.fromBankDescription : transfer.toBankDescription
}

/** The Wallet on the given side of a Transfer. */
export function walletOnSide(
  transfer: { fromWalletId: string; toWalletId: string },
  side: TransferSide,
): string {
  return side === "from" ? transfer.fromWalletId : transfer.toWalletId
}

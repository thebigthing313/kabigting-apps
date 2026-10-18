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

/**
 * An Actual Transfer entered by hand, or an Actual entered by hand and marked as a Transfer:
 * neither side has a line from the bank or the old ledger yet, so either Wallet's line can still
 * become its side. An ignored Transfer takes no line.
 */
export function enteredByHand(
  transfer: Pick<TransferRow, "status" | "ignored" | "fromSource" | "toSource">,
): boolean {
  if (transfer.status !== "actual" || transfer.ignored) return false
  return !isImported({ source: transfer.fromSource }) && !isImported({ source: transfer.toSource })
}

/** The side of a Transfer this Wallet is on, or null when it is on neither. */
export function sideOf(
  transfer: { fromWalletId: string; toWalletId: string },
  walletId: string,
): TransferSide | null {
  if (transfer.fromWalletId === walletId) return "from"
  return transfer.toWalletId === walletId ? "to" : null
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

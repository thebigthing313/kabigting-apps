import type { Transaction } from "@/data/finances-transactions"
import type { Transfer } from "@/data/finances-transfers"

/** A Transaction's label: its Account, else the bank's description, else the note. */
export function transactionLabel(
  transaction: Pick<Transaction, "accountId" | "bankDescription" | "note">,
  accountName: ReadonlyMap<string, string>,
): string {
  const account =
    transaction.accountId === null ? undefined : accountName.get(transaction.accountId)
  return account ?? (transaction.bankDescription || transaction.note || "No Account")
}

/** A Transfer as one of its Wallets sees it: "Transfer to <Wallet>" or "Transfer from <Wallet>". */
export function transferLabel(
  transfer: Pick<Transfer, "fromWalletId" | "toWalletId">,
  walletId: string,
  walletName: ReadonlyMap<string, string>,
): string {
  const out = transfer.fromWalletId === walletId
  const other = walletName.get(out ? transfer.toWalletId : transfer.fromWalletId) ?? "a Wallet"
  return `Transfer ${out ? "to" : "from"} ${other}`
}

/** Its Category's name, or Uncategorised. */
export function categoryLabel(
  transaction: Pick<Transaction, "categoryId">,
  categoryName: ReadonlyMap<string, string>,
): string {
  return (
    (transaction.categoryId === null ? undefined : categoryName.get(transaction.categoryId)) ??
    "Uncategorised"
  )
}

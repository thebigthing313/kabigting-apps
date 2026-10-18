import type { Transaction } from "@/data/finances-transactions"

/** A Transaction's label: its Account, else the bank's description, else the note. */
export function transactionLabel(
  transaction: Pick<Transaction, "accountId" | "bankDescription" | "note">,
  accountName: ReadonlyMap<string, string>,
): string {
  const account =
    transaction.accountId === null ? undefined : accountName.get(transaction.accountId)
  return account ?? (transaction.bankDescription || transaction.note || "No Account")
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

import { and, eq, gt, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineOnDemandCollection } from "@/data/collection-factory"
import { readJson, reportError } from "@/data/error-handler"
import { nowInstant } from "@shared/dates"
import { isImported, type TransactionRow, type UpdateTransaction } from "@shared/finances/schemas"
import { newId } from "@shared/ids"

export type Transaction = TransactionRow

/** What a person enters for a one-off Planned or an Actual. */
export type NewTransaction = Pick<
  TransactionRow,
  "status" | "walletId" | "date" | "amountCents" | "accountId" | "categoryId" | "note"
>

/** What a person may change on a row; an imported Actual keeps its amount, date and Wallet. */
export type TransactionChanges = Partial<Omit<NewTransaction, "status">>

function editable(changes: Partial<TransactionRow>): UpdateTransaction {
  const { walletId, date, amountCents, accountId, categoryId, note, ignored } = changes
  return {
    // Only Restore changes `ignored` in place; Delete is what ignores an imported line.
    ...(ignored === false ? { ignored } : {}),
    ...(walletId === undefined ? {} : { walletId }),
    ...(date === undefined ? {} : { date }),
    ...(amountCents === undefined ? {} : { amountCents }),
    ...(accountId === undefined ? {} : { accountId }),
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(note === undefined ? {} : { note }),
  }
}

/**
 * One-off Planned and Actual Transactions share one collection and load on demand: only the
 * Wallets, dates and pages on screen are fetched. They stay fresh for five minutes.
 */
const financesTransactions = defineOnDemandCollection<TransactionRow>({
  id: "finances-transactions",
  queryKey: ["finances", "transactions"],
  staleTime: 5 * 60_000,
  fetchRows: async (query) =>
    (await readJson(await api.finances.transactions.query.$post({ json: query }))).rows,
  create: async ({ id, status, walletId, date, amountCents, accountId, categoryId, note }) =>
    readJson(
      await api.finances.transactions.$post({
        json: { id, status, walletId, date, amountCents, accountId, categoryId, note },
      }),
    ),
  update: async (id, changes) =>
    readJson(
      await api.finances.transactions[":id"].$patch({ param: { id }, json: editable(changes) }),
    ),
  remove: async (id) => readJson(await api.finances.transactions[":id"].$delete({ param: { id } })),
})

/** Dates are `YYYY-MM-DD`, so plain string order is date order and can page. */
const NEWEST_FIRST = { direction: "desc", stringSort: "lexical" } as const
const OLDEST_FIRST = { direction: "asc", stringSort: "lexical" } as const

/**
 * A Wallet's Actuals dated after `after`: what its balance adds to a Balance check on that date.
 * Nothing loads while `after` is undefined (the Wallet has no check yet, or it is loading).
 */
export function useActualsSince(walletId: string, after: string | undefined) {
  const transactions = financesTransactions()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      after === undefined
        ? undefined
        : q
            .from({ row: transactions })
            .where(({ row }) =>
              and(
                eq(row.walletId, walletId),
                eq(row.status, "actual"),
                eq(row.ignored, false),
                gt(row.date, after),
              ),
            ),
    [transactions, walletId, after],
  )
  return { actuals: data ?? [], isLoading: after !== undefined && isLoading }
}

/**
 * A Wallet's outstanding one-off Planned Transactions, soonest first: upcoming ones, and Overdue
 * ones whose date has passed. A Reconciled one is no longer outstanding.
 */
export function useOutstandingOneOffs(walletId: string) {
  const transactions = financesTransactions()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ row: transactions })
        .where(({ row }) => and(eq(row.walletId, walletId), eq(row.status, "planned")))
        .orderBy(({ row }) => row.date, OLDEST_FIRST),
    [transactions, walletId],
  )
  // Few enough to filter here; the server has no filter for the Reconcile link.
  return { oneOffs: data.filter((row) => row.reconciledActualId === null), isLoading }
}

/**
 * A Wallet's Actuals, newest first: the `count` newest, plus one more when there are older ones.
 * Raising `count` loads the next page.
 */
export function useActivity(walletId: string, count: number) {
  const transactions = financesTransactions()
  return useLiveQuery(
    (q) =>
      q
        .from({ row: transactions })
        .where(({ row }) =>
          and(eq(row.walletId, walletId), eq(row.status, "actual"), eq(row.ignored, false)),
        )
        .orderBy(({ row }) => row.date, NEWEST_FIRST)
        .limit(count + 1),
    [transactions, walletId, count],
  )
}

/**
 * A Wallet's ignored lines (imported Actuals a person deleted), newest first. The server can only
 * add ignored rows to a Wallet's others, so this loads all of them and keeps the ignored ones.
 */
export function useIgnoredLines(walletId: string, enabled: boolean) {
  const transactions = financesTransactions()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      enabled
        ? q
            .from({ row: transactions })
            .where(({ row }) =>
              and(eq(row.walletId, walletId), eq(row.status, "actual"), eq(row.ignored, true)),
            )
            .orderBy(({ row }) => row.date, NEWEST_FIRST)
        : undefined,
    [transactions, walletId, enabled],
  )
  return { lines: data ?? [], isLoading: enabled && isLoading }
}

/** Writes rows the server added outside the collection's own writes, such as an upload's. */
export async function writeTransactions(rows: readonly TransactionRow[]): Promise<void> {
  if (rows.length > 0) await financesTransactions().utils.writeUpsert([...rows])
}

/** True once the server accepted the write; false after a rollback (already reported). */
async function settled(transaction: { when: (state: "settled") => Promise<unknown> }) {
  try {
    await transaction.when("settled")
    return true
  } catch {
    return false
  }
}

/** Shows the row at once; resolves false after a refusal rolled it back (with a toast). */
export function addTransaction(input: NewTransaction): Promise<boolean> {
  const now = nowInstant()
  const actual = input.status === "actual"
  return settled(
    financesTransactions().insert({
      id: newId(),
      ...input,
      bankDescription: null,
      source: actual ? "manual" : null,
      ignored: false,
      // A hand-entered Actual never waits in To review.
      reviewedAt: actual ? now : null,
      reconciledActualId: null,
      createdAt: now,
      updatedAt: now,
    }),
  )
}

export function editTransaction(id: string, changes: TransactionChanges): Promise<boolean> {
  return settled(
    financesTransactions().update(id, (draft) => {
      Object.assign(draft, changes)
    }),
  )
}

/**
 * Deletes a hand-entered row. An imported Actual is kept by the server as an ignored line, which
 * stays in the collection, marked, for the Ignored lines list.
 */
export async function deleteTransaction(row: Transaction): Promise<boolean> {
  if (!isImported(row)) return settled(financesTransactions().delete(row.id))
  try {
    const ignored = await readJson(
      await api.finances.transactions[":id"].$delete({ param: { id: row.id } }),
    )
    await writeTransactions([ignored])
    return true
  } catch (error) {
    reportError(error, "Deleting")
    return false
  }
}

/** Brings an ignored line back into the Wallet's Actuals. */
export function restoreTransaction(id: string): Promise<boolean> {
  return settled(
    financesTransactions().update(id, (draft) => {
      draft.ignored = false
    }),
  )
}

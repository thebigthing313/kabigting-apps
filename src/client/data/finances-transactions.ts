import { and, eq, gt, gte, lte, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineOnDemandCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { useActualTransfersSince } from "@/data/finances-transfers"
import { settled } from "@/data/settled"
import { monthDates, nowInstant, shiftMonth } from "@shared/dates"
import type { TransactionRow, UpdateTransaction } from "@shared/finances/schemas"
import { AVERAGE_MONTHS } from "@shared/finances/summary"
import { transferAmountOn } from "@shared/finances/transfers"
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
  const { walletId, date, amountCents, accountId, categoryId, note } = changes
  return {
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
 * `actuals` holds its Actual Transactions and Actual Transfers, each signed as it moved this
 * Wallet; `transactions` and `transfers` are the rows themselves. Nothing loads while `after` is
 * undefined (the Wallet has no check yet, or it is loading).
 */
export function useActualsSince(walletId: string, after: string | undefined) {
  const transactions = financesTransactions()
  const { transfers, isLoading: transfersLoading } = useActualTransfersSince(walletId, after)
  const { data, isLoading } = useLiveQuery(
    (q) =>
      after === undefined
        ? undefined
        : q
            .from({ row: transactions })
            .where(({ row }) =>
              and(eq(row.walletId, walletId), eq(row.status, "actual"), gt(row.date, after)),
            ),
    [transactions, walletId, after],
  )
  const own = data ?? []
  const actuals: WalletMove[] = [
    ...own.map(({ id, date, amountCents }) => ({ id, date, amountCents })),
    ...transfers.map((transfer) => ({
      id: transfer.id,
      date: transfer.date,
      amountCents: transferAmountOn(transfer, walletId),
    })),
  ]
  return {
    actuals,
    transactions: own,
    transfers,
    isLoading: (after !== undefined && isLoading) || transfersLoading,
  }
}

/** Money that moved one Wallet, signed as it moved it. */
export type WalletMove = { id: string; date: string; amountCents: number }

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
        .where(({ row }) => and(eq(row.walletId, walletId), eq(row.status, "actual")))
        .orderBy(({ row }) => row.date, NEWEST_FIRST)
        .limit(count + 1),
    [transactions, walletId, count],
  )
}

/** Every Wallet's Actuals dated `from` to `to`, inclusive, ignored lines left out. */
export function useActualsBetween(from: string, to: string) {
  const transactions = financesTransactions()
  return useLiveQuery(
    (q) =>
      q
        .from({ row: transactions })
        .where(({ row }) =>
          and(
            eq(row.status, "actual"),
            eq(row.ignored, false),
            gte(row.date, from),
            lte(row.date, to),
          ),
        ),
    [transactions, from, to],
  )
}

/**
 * The Actuals a Monthly summary of `month` reads: every Wallet's in that month and the 12 before
 * it, plus the household's `first` Actual when it is older, which places the first month.
 */
export function useSummaryActuals(month: string, first: Transaction | undefined) {
  const from = monthDates(shiftMonth(month, -AVERAGE_MONTHS)).first
  const { data, isLoading } = useActualsBetween(from, monthDates(month).last)
  const actuals = first !== undefined && first.date < from ? [...data, first] : data
  return { actuals, isLoading }
}

/** The household's first Actual in any Wallet, ignored lines left out; none when there is none. */
export function useFirstActual() {
  const transactions = financesTransactions()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ row: transactions })
        .where(({ row }) => and(eq(row.status, "actual"), eq(row.ignored, false)))
        .orderBy(({ row }) => row.date, OLDEST_FIRST)
        .limit(1),
    [transactions],
  )
  return { first: data[0], isLoading }
}

/**
 * How many Transactions, Planned and Actual, a Category holds, ignored lines left out. Nothing
 * loads while `categoryId` is undefined.
 */
export function useCategoryTransactionCount(categoryId: string | undefined) {
  const transactions = financesTransactions()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      categoryId === undefined
        ? undefined
        : q
            .from({ row: transactions })
            .where(({ row }) => and(eq(row.categoryId, categoryId), eq(row.ignored, false))),
    [transactions, categoryId],
  )
  return { count: data?.length ?? 0, isLoading: categoryId !== undefined && isLoading }
}

/**
 * Writes rows a command changed, such as a Category merge, into the collection. Only rows already
 * loaded are written: the rest load when a screen asks for them, so unasked-for rows (ignored
 * lines among them) never reach a live query.
 */
export async function writeTransactions(rows: readonly TransactionRow[]): Promise<void> {
  const collection = financesTransactions()
  const loaded = rows.filter((row) => collection.has(row.id))
  if (loaded.length > 0) await collection.utils.writeUpsert(loaded)
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

/** Deletes a hand-entered row; an imported Actual is kept by the server as an ignored line. */
export function deleteTransaction(id: string): Promise<boolean> {
  return settled(financesTransactions().delete(id))
}

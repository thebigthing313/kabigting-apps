import { and, eq, gt, gte, inArray, lte, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineOnDemandCollection } from "@/data/collection-factory"
import { readJson, reportError } from "@/data/error-handler"
import { applyOccurrenceChanges } from "@/data/finances-occurrences"
import { useActualTransfersSince } from "@/data/finances-transfers"
import { settled } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import type {
  Reconcile,
  ReconcileResult,
  TransactionRow,
  UpdateTransaction,
} from "@shared/finances/schemas"
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
 * A Wallet's one-off Planned Transactions, soonest first. `oneOffs` are the outstanding ones:
 * upcoming, and Overdue once their date has passed. A Reconciled one is no longer outstanding;
 * `planned` keeps those too, to show what an Actual is Reconciled to.
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
  return {
    oneOffs: data.filter((row) => row.reconciledActualId === null),
    planned: data,
    isLoading,
  }
}

/** The Transactions with these ids, such as the Actuals a Schedule's Occurrences are Reconciled to. */
export function useTransactionsById(ids: readonly string[]) {
  const transactions = financesTransactions()
  const key = ids.toSorted().join(",")
  const { data } = useLiveQuery(
    (q) =>
      key === ""
        ? undefined
        : q.from({ row: transactions }).where(({ row }) => inArray(row.id, key.split(","))),
    [transactions, key],
  )
  return new Map((data ?? []).map((row) => [row.id, row]))
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
 * Shows the row at once; resolves false after a refusal rolled it back (with a toast). `id` is
 * the new row's, given when something else will refer to it.
 */
export function addTransaction(input: NewTransaction, id: string = newId()): Promise<boolean> {
  const now = nowInstant()
  const actual = input.status === "actual"
  return settled(
    financesTransactions().insert({
      id,
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

/** Writes a Reconcile command's changed rows into the collections it touched. */
async function applyReconcile(result: ReconcileResult): Promise<void> {
  if (result.transactions.length > 0) {
    await financesTransactions().utils.writeUpsert(result.transactions)
  }
  await applyOccurrenceChanges(result.occurrences, result.deletedOccurrences)
}

/** Runs a Reconcile command; false after a refusal, which is reported with a toast. */
async function reconcileCommand(run: () => Promise<ReconcileResult>): Promise<boolean> {
  let result: ReconcileResult
  try {
    result = await run()
  } catch (error) {
    reportError(error, "Saving")
    return false
  }
  await applyReconcile(result)
  return true
}

/** Reconciles an Actual to an outstanding Planned item, one to one. */
export function reconcileActual(body: Reconcile): Promise<boolean> {
  return reconcileCommand(async () => readJson(await api.finances.reconcile.$post({ json: body })))
}

/** Un-Reconciles an Actual: its Planned item is outstanding again, at its own amount. */
export function unreconcileActual(actualId: string): Promise<boolean> {
  return reconcileCommand(async () =>
    readJson(await api.finances.unreconcile.$post({ json: { actualId } })),
  )
}

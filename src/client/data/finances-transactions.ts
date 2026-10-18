import { and, eq, gt, gte, inArray, isNull, lte, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineOnDemandCollection } from "@/data/collection-factory"
import { readJson, reportError } from "@/data/error-handler"
import { applyOccurrenceChanges } from "@/data/finances-occurrences"
import { useActualTransfersSince, writeTransfers } from "@/data/finances-transfers"
import { settled } from "@/data/settled"
import { monthDates, nowInstant, shiftMonth } from "@shared/dates"
import {
  isImported,
  type Reconcile,
  type ReconcileResult,
  type TransactionRow,
  type UpdateTransaction,
} from "@shared/finances/schemas"
import { AVERAGE_MONTHS } from "@shared/finances/summary"
import { transferAmountOn } from "@shared/finances/transfers"
import { newId } from "@shared/ids"
import { MAX_QUERY_IDS } from "@shared/schemas/query"

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
              and(
                eq(row.walletId, walletId),
                eq(row.status, "actual"),
                eq(row.ignored, false),
                gt(row.date, after),
              ),
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
 * Every Wallet's outstanding one-off Planned Transactions, soonest first, in one request however
 * many Wallets there are. Each Forecast and the bell take their Wallet's from these.
 */
export function useHouseholdOutstandingOneOffs() {
  const transactions = financesTransactions()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ row: transactions })
        .where(({ row }) => eq(row.status, "planned"))
        .orderBy(({ row }) => row.date, OLDEST_FIRST),
    [transactions],
  )
  // The server has no filter for the Reconcile link.
  return { oneOffs: data.filter((row) => row.reconciledActualId === null), isLoading }
}

/** Every Wallet's uploaded lines waiting in To review, oldest first, in one request. */
export function useHouseholdToReview() {
  const transactions = financesTransactions()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ row: transactions })
        .where(({ row }) =>
          and(eq(row.status, "actual"), eq(row.ignored, false), isNull(row.reviewedAt)),
        )
        .orderBy(({ row }) => row.date, OLDEST_FIRST),
    [transactions],
  )
  return { lines: data, isLoading }
}

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

/**
 * A Wallet's To review: its uploaded lines no one has reviewed yet, oldest first. Hand-entered
 * Actuals are reviewed as they are saved, so they never wait here.
 */
export function useToReview(walletId: string) {
  const transactions = financesTransactions()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ row: transactions })
        .where(({ row }) =>
          and(
            eq(row.walletId, walletId),
            eq(row.status, "actual"),
            eq(row.ignored, false),
            isNull(row.reviewedAt),
          ),
        )
        .orderBy(({ row }) => row.date, OLDEST_FIRST),
    [transactions, walletId],
  )
  return { lines: data, isLoading }
}

/**
 * A Wallet's Actuals dated `from` to `to`, inclusive, ignored lines left out; nothing loads
 * while `range` is null.
 */
export function useWalletActualsBetween(
  walletId: string,
  range: { from: string; to: string } | null,
) {
  const transactions = financesTransactions()
  const from = range?.from
  const to = range?.to
  const { data } = useLiveQuery(
    (q) =>
      from === undefined || to === undefined
        ? undefined
        : q
            .from({ row: transactions })
            .where(({ row }) =>
              and(
                eq(row.walletId, walletId),
                eq(row.status, "actual"),
                eq(row.ignored, false),
                gte(row.date, from),
                lte(row.date, to),
              ),
            ),
    [transactions, walletId, from, to],
  )
  return data ?? []
}

/** Writes rows the server added outside the collection's own writes, such as an upload's. */
export async function writeTransactions(rows: readonly TransactionRow[]): Promise<void> {
  if (rows.length > 0) await financesTransactions().utils.writeUpsert([...rows])
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
 * Writes the rows a command changed that are already loaded, such as a Category merge's. The rest,
 * possibly years of history, load when a screen asks for them.
 */
export async function writeLoadedTransactions(rows: readonly TransactionRow[]): Promise<void> {
  const collection = financesTransactions()
  const loaded = rows.filter((row) => collection.has(row.id))
  if (loaded.length > 0) await collection.utils.writeUpsert(loaded)
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

/** Writes a Reconcile command's changed rows into the collections it touched. */
async function applyReconcile(result: ReconcileResult): Promise<void> {
  const transactions = financesTransactions()
  if (result.transactions.length > 0) await transactions.utils.writeUpsert(result.transactions)
  // A line Reconciled to a Planned Transfer became an Actual Transfer.
  const gone = result.deletedTransactions.filter((id) => transactions.has(id))
  if (gone.length > 0) await transactions.utils.writeDelete(gone)
  await writeTransfers(result.transfers)
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

/**
 * Marks uploaded lines reviewed, taking them out of To review as unplanned. Resolves false after
 * a refusal, which is reported with a toast.
 */
export async function markLinesReviewed(ids: readonly string[]): Promise<boolean> {
  try {
    for (let start = 0; start < ids.length; start += MAX_QUERY_IDS) {
      const chunk = ids.slice(start, start + MAX_QUERY_IDS)
      const { rows } = await readJson(
        await api.finances.transactions["mark-reviewed"].$post({ json: { ids: chunk } }),
      )
      await writeTransactions(rows)
    }
    return true
  } catch (error) {
    reportError(error, "Saving")
    return false
  }
}

/**
 * The Actual was money moved to or from another Wallet: it becomes an Actual Transfer. An
 * uploaded line keys its own side, and the other side waits for that Wallet's line.
 */
export function markAsTransfer(actualId: string, otherWalletId: string): Promise<boolean> {
  return reconcileCommand(async () =>
    readJson(
      await api.finances.transactions[":id"]["mark-transfer"].$post({
        param: { id: actualId },
        json: { otherWalletId },
      }),
    ),
  )
}

/** The uploaded line is the Transfer's missing side: it joins the Transfer and goes. */
export function pairTransferSide(transferId: string, lineId: string): Promise<boolean> {
  return reconcileCommand(async () =>
    readJson(
      await api.finances.transfers[":id"].pair.$post({
        param: { id: transferId },
        json: { actualId: lineId },
      }),
    ),
  )
}

/**
 * The uploaded line repeats a hand-entered Actual: the line stays with the hand entry's Account,
 * Category, note and Reconcile, and the hand entry goes.
 */
export function confirmSameAsHandEntry(lineId: string, handEntryId: string): Promise<boolean> {
  return reconcileCommand(async () =>
    readJson(
      await api.finances.transactions[":id"]["same-as-hand-entry"].$post({
        param: { id: lineId },
        json: { handEntryId },
      }),
    ),
  )
}

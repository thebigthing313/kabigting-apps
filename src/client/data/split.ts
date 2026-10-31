// The Split App's client data: every Expense, Payment and Category in eager collections, as every
// Member sees all of them and Balances need them all; the Members as a plain query. Refetches
// follow the Shell's focus and reconnect defaults.
import { lower, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { useSyncExternalStore } from "react"
import { toast } from "sonner"
import { api } from "@/data/api"
import {
  defineRestCollection,
  isNoAccess,
  isNotFound,
  isTaken,
  type WriteOptions,
} from "@/data/collection-factory"
import { isUnreached, readJson } from "@/data/error-handler"
import { queryClient } from "@/data/query-client"
import { type Settling, settled, writeFailure } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import { newId } from "@shared/ids"
import {
  editExpenseRoster,
  editPaymentAllowed,
  newExpenseRoster,
  paymentProblems,
  resolveExpense,
  type ExpenseResolution,
  type PaymentProblem,
} from "@shared/split/rules"
import type {
  CategoryRow,
  CreateExpense,
  CreatePayment,
  ExpenseRow,
  PaymentRow,
  UpdateCategory,
  UpdateExpense,
  UpdatePayment,
} from "@shared/split/schemas"

export type {
  CategoryRow as Category,
  ExpenseRow as Expense,
  Member,
  PaymentRow as Payment,
} from "@shared/split/schemas"

/** What a Member enters for an Expense; the server works out the rest. */
function entered(row: ExpenseRow): UpdateExpense {
  const { description, date, categoryId, total, note, paid, owed } = row
  return { description, date, categoryId, total, note, paid, owed }
}

// A change replaces the whole Expense, so it sends the whole row as changed. One the server says
// is gone is dropped.
const expensesCollection = defineRestCollection<ExpenseRow>({
  id: "split-expenses",
  queryKey: ["split", "expenses"],
  fetchRows: async () => (await readJson(await api.split.expenses.$get())).rows,
  create: async (row) => {
    const json = { id: row.id, ...entered(row) }
    return readJson(await api.split.expenses.$post({ json }))
  },
  update: async (id, _changes, _options, row) =>
    readJson(await api.split.expenses[":id"].$put({ param: { id }, json: entered(row) })),
  remove: async (id) => readJson(await api.split.expenses[":id"].$delete({ param: { id } })),
  dropOnNotFound: true,
})

/** Every Expense, live, in no particular order. */
export function useExpenses() {
  const expenses = expensesCollection()
  return useLiveQuery((q) => q.from({ expense: expenses }), [expenses])
}

/** Split's Members, oldest Account first. */
export function useMembers() {
  return useQuery({
    queryKey: ["split", "members"],
    queryFn: async () => (await readJson(await api.split.members.$get())).rows,
  })
}

function editable(changes: Partial<CategoryRow>): UpdateCategory {
  const { name, archived } = changes
  return {
    ...(name === undefined ? {} : { name }),
    ...(archived === undefined ? {} : { archived }),
  }
}

// Categories are never deleted, only archived, so removing one is refused here.
const categoriesCollection = defineRestCollection<CategoryRow>({
  id: "split-categories",
  queryKey: ["split", "categories"],
  fetchRows: async () => (await readJson(await api.split.categories.$get())).rows,
  create: async ({ id, name }) =>
    readJson(await api.split.categories.$post({ json: { id, name } })),
  update: async (id, changes) =>
    readJson(await api.split.categories[":id"].$patch({ param: { id }, json: editable(changes) })),
  remove: () => Promise.reject(new Error("Categories are archived, never deleted")),
})

/**
 * Every Category, archived ones included, by name regardless of case, live. `data` is undefined
 * until they have loaded.
 */
export function useCategories() {
  const categories = categoriesCollection()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ category: categories })
        .orderBy(({ category }) => lower(category.name), "asc")
        .orderBy(({ category }) => category.id, "asc"),
    [categories],
  )
  return { data: isLoading ? undefined : data, isLoading }
}

/** Adds a Category, in use, shown at once; a refusal, such as a taken name, rolls it back. */
export function addCategory(name: string): Promise<boolean> {
  return settled(categoriesCollection().insert({ id: newId(), name, archived: false }))
}

/** Renames a Category for every Member; a refusal puts the old name back. */
export function renameCategory(id: string, name: string): Promise<boolean> {
  return settled(
    categoriesCollection().update(id, (draft) => {
      draft.name = name
    }),
  )
}

/** Archives a Category, or puts it back in use; it stays on its Expenses either way. */
export function setCategoryArchived(id: string, archived: boolean): Promise<boolean> {
  return settled(
    categoriesCollection().update(id, (draft) => {
      draft.archived = archived
    }),
  )
}

/**
 * How a save or delete of an Expense or Payment ended, for its form to act on:
 * - "saved": stored. A create whose id was already stored counts, since an earlier try whose
 *   answer was lost got there; so does deleting what is already gone.
 * - "refused": by the rules or the server; rolled back and reported.
 * - "unreached": the network or a gateway failed; rolled back, not reported, and never retried.
 * - "gone": what was being changed has been deleted; it drops out and nothing is recreated.
 * - "no-access": the viewer no longer has access to Split.
 * Only "refused" is reported here; the form tells the viewer about the rest.
 */
export type EntryOutcome = "saved" | "refused" | "unreached" | "gone" | "no-access"

/** What an Expense or Payment write leaves to its form to tell. */
const ENTRY_WRITE: { metadata: WriteOptions } = {
  metadata: {
    quietWhenUnreached: true,
    quietWhenGone: true,
    quietWhenTaken: true,
    quietWhenNoAccess: true,
  },
}

/** How an Expense or Payment write ended; `onTaken` brings in what an earlier try stored. */
async function entryOutcome(
  transaction: Settling,
  onTaken: () => Promise<unknown> = () => Promise.resolve(),
): Promise<EntryOutcome> {
  const failed = await writeFailure(transaction)
  if (!failed) return "saved"
  const { error } = failed
  if (isTaken(error)) {
    await onTaken().catch(() => undefined)
    return "saved"
  }
  if (isNoAccess(error)) return "no-access"
  if (isNotFound(error)) return "gone"
  return isUnreached(error) ? "unreached" : "refused"
}

/**
 * True while a load of Split's data was last refused because the viewer no longer has access to
 * Split (403 `forbidden_app`), as when a refetch finds access revoked. Such a refusal is never
 * retried, so it shows at once.
 */
export function useSplitAccessLost(): boolean {
  const cache = queryClient.getQueryCache()
  return useSyncExternalStore(
    (onChange) => cache.subscribe(onChange),
    () => cache.findAll({ queryKey: ["split"] }).some((query) => isNoAccess(query.state.error)),
  )
}

/**
 * A delete runs after its form has closed, so only a gone entry (counted as deleted) and lost
 * access (the form's caller acts on it) are quiet; anything else is reported, and it comes back.
 */
const ENTRY_DELETE: { metadata: WriteOptions } = {
  metadata: { quietWhenGone: true, quietWhenNoAccess: true },
}

/** Deletes an entry for good; one already gone, here or on the server, counts as deleted. */
function deleteEntry(
  collection: { has: (id: string) => boolean; delete: (id: string, config: object) => Settling },
  id: string,
): Promise<EntryOutcome> {
  if (!collection.has(id)) return Promise.resolve("saved")
  return entryOutcome(collection.delete(id, ENTRY_DELETE)).then((outcome) =>
    outcome === "gone" ? "saved" : outcome,
  )
}

/** Reports an Expense the rules refuse; nothing is sent. */
function refused(resolved: Extract<ExpenseResolution, { ok: false }>): Promise<EntryOutcome> {
  toast.error("Saving failed", {
    description: resolved.problems.map((problem) => problem.message).join(". "),
  })
  return Promise.resolve("refused")
}

/**
 * Saves a new Expense added by `viewerId`. It shows at once, with its shares worked out here by
 * the same rules the server applies, among `memberIds` (the Members, oldest Account first); the
 * server's row then replaces it. Anything but stored leaves nothing behind; see `EntryOutcome`.
 */
export function addExpense(
  input: CreateExpense,
  viewerId: string,
  memberIds: readonly string[],
): Promise<EntryOutcome> {
  const resolved = resolveExpense(input, newExpenseRoster(memberIds))
  if (!resolved.ok) return refused(resolved)
  const now = nowInstant()
  const expenses = expensesCollection()
  return entryOutcome(
    expenses.insert(
      {
        ...input,
        paidShares: resolved.paidShares,
        owedShares: resolved.owedShares,
        addedBy: viewerId,
        addedAt: now,
        changedBy: viewerId,
        changedAt: now,
      },
      ENTRY_WRITE,
    ),
    () => expenses.utils.refetch(),
  )
}

/**
 * Saves `saved` as it now stands, replacing all of it, changed by `viewerId`. As `addExpense`, it
 * shows at once and the server's row then replaces it; those already on it stay allowed, Former
 * members included. Gone, it drops out and is never recreated; see `EntryOutcome`.
 */
export function changeExpense(
  saved: ExpenseRow,
  input: UpdateExpense,
  viewerId: string,
  memberIds: readonly string[],
): Promise<EntryOutcome> {
  const resolved = resolveExpense(input, editExpenseRoster(memberIds, memberIds, saved))
  if (!resolved.ok) return refused(resolved)
  const expenses = expensesCollection()
  if (!expenses.has(saved.id)) return Promise.resolve("gone")
  return entryOutcome(
    expenses.update(saved.id, ENTRY_WRITE, (draft) => {
      Object.assign(draft, {
        ...input,
        paidShares: resolved.paidShares,
        owedShares: resolved.owedShares,
        changedBy: viewerId,
        changedAt: nowInstant(),
      })
    }),
  )
}

/**
 * Deletes an Expense for good. It goes at once; "saved" once the server has deleted it too, or
 * found it already gone.
 */
export function deleteExpense(id: string): Promise<EntryOutcome> {
  return deleteEntry(expensesCollection(), id)
}

/** What a Member enters for a Payment. */
function enteredPayment(row: PaymentRow): UpdatePayment {
  const { date, fromId, toId, amount, note } = row
  return { date, fromId, toId, amount, note }
}

// As with Expenses, a change replaces the whole Payment, and one the server says is gone is dropped.
const paymentsCollection = defineRestCollection<PaymentRow>({
  id: "split-payments",
  queryKey: ["split", "payments"],
  fetchRows: async () => (await readJson(await api.split.payments.$get())).rows,
  create: async (row) => {
    const json = { id: row.id, ...enteredPayment(row) }
    return readJson(await api.split.payments.$post({ json }))
  },
  update: async (id, _changes, _options, row) =>
    readJson(await api.split.payments[":id"].$put({ param: { id }, json: enteredPayment(row) })),
  remove: async (id) => readJson(await api.split.payments[":id"].$delete({ param: { id } })),
  dropOnNotFound: true,
})

/** Every Payment, live, in no particular order. */
export function usePayments() {
  const payments = paymentsCollection()
  return useLiveQuery((q) => q.from({ payment: payments }), [payments])
}

/** Reports a Payment the rules refuse; nothing is sent. */
function refusedPayment(problems: readonly PaymentProblem[]): Promise<EntryOutcome> {
  toast.error("Saving failed", {
    description: problems.map((problem) => problem.message).join(". "),
  })
  return Promise.resolve("refused")
}

/**
 * Records a new Payment added by `viewerId`, between two of `memberIds`. As `addExpense`, it shows
 * at once and the server's row then replaces it; outcomes as for `addExpense`.
 */
export function addPayment(
  input: CreatePayment,
  viewerId: string,
  memberIds: readonly string[],
): Promise<EntryOutcome> {
  const problems = paymentProblems(input, new Set(memberIds))
  if (problems.length > 0) return refusedPayment(problems)
  const now = nowInstant()
  const payments = paymentsCollection()
  return entryOutcome(
    payments.insert(
      { ...input, addedBy: viewerId, addedAt: now, changedBy: viewerId, changedAt: now },
      ENTRY_WRITE,
    ),
    () => payments.utils.refetch(),
  )
}

/**
 * Saves `saved` as it now stands, replacing all of it, changed by `viewerId`. Whoever is already
 * on it stays allowed. Outcomes as for `changeExpense`.
 */
export function changePayment(
  saved: PaymentRow,
  input: UpdatePayment,
  viewerId: string,
  memberIds: readonly string[],
): Promise<EntryOutcome> {
  const problems = paymentProblems(input, editPaymentAllowed(memberIds, saved))
  if (problems.length > 0) return refusedPayment(problems)
  const payments = paymentsCollection()
  if (!payments.has(saved.id)) return Promise.resolve("gone")
  return entryOutcome(
    payments.update(saved.id, ENTRY_WRITE, (draft) => {
      Object.assign(draft, { ...input, changedBy: viewerId, changedAt: nowInstant() })
    }),
  )
}

/** Deletes a Payment for good; outcomes as for `deleteExpense`. */
export function deletePayment(id: string): Promise<EntryOutcome> {
  return deleteEntry(paymentsCollection(), id)
}

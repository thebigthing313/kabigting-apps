// The Split App's client data: every Expense, Payment and Category in eager collections, as every
// Member sees all of them and Balances need them all; the Members as a plain query. Refetches
// follow the Shell's focus and reconnect defaults.
import { lower, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { queryClient } from "@/data/query-client"
import { settled } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import { newId } from "@shared/ids"
import {
  editExpenseRoster,
  editPaymentAllowed,
  memberIdsOf,
  newExpenseRoster,
  newPaymentAllowed,
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
  Member,
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

const MEMBERS_KEY = ["split", "members"]

/**
 * Every Account Split shows, oldest Account first, by standing: the Members; the Former members,
 * who keep their shares and Balance but are never added to a new Expense; and those named only as
 * who added or changed an entry.
 */
export function useMembers() {
  return useQuery({
    queryKey: MEMBERS_KEY,
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

/** Reports an Expense the rules refuse; nothing is sent. */
function refused(resolved: Extract<ExpenseResolution, { ok: false }>): Promise<false> {
  toast.error("Saving failed", {
    description: resolved.problems.map((problem) => problem.message).join(". "),
  })
  return Promise.resolve(false)
}

/**
 * After the server refuses an entry, fetches the Accounts again: someone on it may have lost App
 * access since the form opened, and the form then flags them.
 */
async function refetchMembersUnless(stored: boolean): Promise<boolean> {
  if (!stored) await queryClient.invalidateQueries({ queryKey: MEMBERS_KEY })
  return stored
}

/** The Accounts as last fetched, if they have been. */
export function latestMembers(): Member[] | undefined {
  return queryClient.getQueryData<Member[]>(MEMBERS_KEY)
}

/**
 * Saves a new Expense added by `viewerId`. It shows at once, with its shares worked out here by
 * the same rules the server applies, among the Members in `accounts` (oldest Account first); the
 * server's row then replaces it. True once stored. False when it is refused, here by the rules or
 * by the server, and then it is reported and nothing stays.
 */
export function addExpense(
  input: CreateExpense,
  viewerId: string,
  accounts: readonly Member[],
): Promise<boolean> {
  const resolved = resolveExpense(input, newExpenseRoster(memberIdsOf(accounts)))
  if (!resolved.ok) return refused(resolved)
  const now = nowInstant()
  return settled(
    expensesCollection().insert({
      ...input,
      paidShares: resolved.paidShares,
      owedShares: resolved.owedShares,
      addedBy: viewerId,
      addedAt: now,
      changedBy: viewerId,
      changedAt: now,
    }),
  ).then(refetchMembersUnless)
}

/**
 * Saves `saved` as it now stands, replacing all of it, changed by `viewerId`. As `addExpense`, it
 * shows at once and the server's row then replaces it; those already on it stay allowed, Former
 * members included. True once stored; false when refused, or gone (then it
 * drops out).
 */
export function changeExpense(
  saved: ExpenseRow,
  input: UpdateExpense,
  viewerId: string,
  accounts: readonly Member[],
): Promise<boolean> {
  const oldestFirst = accounts.map((account) => account.id)
  const roster = editExpenseRoster(oldestFirst, memberIdsOf(accounts), saved)
  const resolved = resolveExpense(input, roster)
  if (!resolved.ok) return refused(resolved)
  return settled(
    expensesCollection().update(saved.id, (draft) => {
      Object.assign(draft, {
        ...input,
        paidShares: resolved.paidShares,
        owedShares: resolved.owedShares,
        changedBy: viewerId,
        changedAt: nowInstant(),
      })
    }),
  ).then(refetchMembersUnless)
}

/** Deletes an Expense for good. It goes at once; true once the server has deleted it too. */
export function deleteExpense(id: string): Promise<boolean> {
  return settled(expensesCollection().delete(id))
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
function refusedPayment(problems: readonly PaymentProblem[]): Promise<false> {
  toast.error("Saving failed", {
    description: problems.map((problem) => problem.message).join(". "),
  })
  return Promise.resolve(false)
}

/**
 * Records a new Payment added by `viewerId`, between two of `accounts`, Former members included. As
 * `addExpense`, it shows at once and the server's row then replaces it. True once stored; false
 * when refused, here by the rules or by the server, and then it is reported and nothing stays.
 */
export function addPayment(
  input: CreatePayment,
  viewerId: string,
  accounts: readonly Member[],
): Promise<boolean> {
  const problems = paymentProblems(input, newPaymentAllowed(accounts))
  if (problems.length > 0) return refusedPayment(problems)
  const now = nowInstant()
  return settled(
    paymentsCollection().insert({
      ...input,
      addedBy: viewerId,
      addedAt: now,
      changedBy: viewerId,
      changedAt: now,
    }),
  ).then(refetchMembersUnless)
}

/**
 * Saves `saved` as it now stands, replacing all of it, changed by `viewerId`. A Member or Former member in `accounts`
 * can be on it, and whoever is already on it stays allowed. True once stored; false when refused,
 * or gone (then it drops out).
 */
export function changePayment(
  saved: PaymentRow,
  input: UpdatePayment,
  viewerId: string,
  accounts: readonly Member[],
): Promise<boolean> {
  const problems = paymentProblems(input, editPaymentAllowed(accounts, saved))
  if (problems.length > 0) return refusedPayment(problems)
  return settled(
    paymentsCollection().update(saved.id, (draft) => {
      Object.assign(draft, { ...input, changedBy: viewerId, changedAt: nowInstant() })
    }),
  ).then(refetchMembersUnless)
}

/** Deletes a Payment for good. It goes at once; true once the server has deleted it too. */
export function deletePayment(id: string): Promise<boolean> {
  return settled(paymentsCollection().delete(id))
}

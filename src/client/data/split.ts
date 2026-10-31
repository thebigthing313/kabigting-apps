// The Split App's client data: every Expense in one eager collection, as every Member sees all of
// them and Balances need them all; the Members and Categories as plain queries. Refetches follow
// the Shell's focus and reconnect defaults.
import { useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { settled } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import {
  editExpenseRoster,
  newExpenseRoster,
  resolveExpense,
  type ExpenseResolution,
} from "@shared/split/rules"
import type { CreateExpense, ExpenseRow, UpdateExpense } from "@shared/split/schemas"

export type { CategoryRow as Category, ExpenseRow as Expense, Member } from "@shared/split/schemas"

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

/** Every Category, archived ones included, by name. */
export function useCategories() {
  return useQuery({
    queryKey: ["split", "categories"],
    queryFn: async () => (await readJson(await api.split.categories.$get())).rows,
  })
}

/** Reports an Expense the rules refuse; nothing is sent. */
function refused(resolved: Extract<ExpenseResolution, { ok: false }>): Promise<false> {
  toast.error("Saving failed", {
    description: resolved.problems.map((problem) => problem.message).join(". "),
  })
  return Promise.resolve(false)
}

/**
 * Saves a new Expense added by `viewerId`. It shows at once, with its shares worked out here by
 * the same rules the server applies, among `memberIds` (the Members, oldest Account first); the
 * server's row then replaces it. True once stored. False when it is refused, here by the rules or
 * by the server, and then it is reported and nothing stays.
 */
export function addExpense(
  input: CreateExpense,
  viewerId: string,
  memberIds: readonly string[],
): Promise<boolean> {
  const resolved = resolveExpense(input, newExpenseRoster(memberIds))
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
  )
}

/**
 * Saves `saved` as it now stands, replacing all of it, changed by `viewerId`. As `addExpense`, it
 * shows at once and the server's row then replaces it; those already on it stay allowed even when
 * they're no longer among `memberIds`. True once stored; false when refused, or gone (then it
 * drops out).
 */
export function changeExpense(
  saved: ExpenseRow,
  input: UpdateExpense,
  viewerId: string,
  memberIds: readonly string[],
): Promise<boolean> {
  const resolved = resolveExpense(input, editExpenseRoster(memberIds, memberIds, saved))
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
  )
}

/** Deletes an Expense for good. It goes at once; true once the server has deleted it too. */
export function deleteExpense(id: string): Promise<boolean> {
  return settled(expensesCollection().delete(id))
}

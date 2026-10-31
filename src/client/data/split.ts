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
import { newExpenseRoster, resolveExpense } from "@shared/split/rules"
import type { CreateExpense, ExpenseRow } from "@shared/split/schemas"

export type { CategoryRow as Category, ExpenseRow as Expense, Member } from "@shared/split/schemas"

// Editing and deleting Expenses come later, so the collection only creates.
const expensesCollection = defineRestCollection<ExpenseRow>({
  id: "split-expenses",
  queryKey: ["split", "expenses"],
  fetchRows: async () => (await readJson(await api.split.expenses.$get())).rows,
  create: async (row) => {
    const { id, description, date, categoryId, total, note, paid, owed } = row
    const json = { id, description, date, categoryId, total, note, paid, owed }
    return readJson(await api.split.expenses.$post({ json }))
  },
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
  if (!resolved.ok) {
    toast.error("Saving failed", {
      description: resolved.problems.map((problem) => problem.message).join(". "),
    })
    return Promise.resolve(false)
  }
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

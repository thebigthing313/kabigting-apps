// The Split App's client data: every Expense and every Category in eager collections, as every
// Member sees all of them and Balances need them all; the Members as a plain query. Refetches
// follow the Shell's focus and reconnect defaults.
import { lower, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { settled } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import { newId } from "@shared/ids"
import { newExpenseRoster, resolveExpense } from "@shared/split/rules"
import type { CategoryRow, CreateExpense, ExpenseRow, UpdateCategory } from "@shared/split/schemas"

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

function editable(changes: Partial<CategoryRow>): UpdateCategory {
  const { name, archived } = changes
  return {
    ...(name === undefined ? {} : { name }),
    ...(archived === undefined ? {} : { archived }),
  }
}

// Categories are never deleted, only archived, so the collection has no remove.
const categoriesCollection = defineRestCollection<CategoryRow>({
  id: "split-categories",
  queryKey: ["split", "categories"],
  fetchRows: async () => (await readJson(await api.split.categories.$get())).rows,
  create: async ({ id, name }) =>
    readJson(await api.split.categories.$post({ json: { id, name } })),
  update: async (id, changes) =>
    readJson(await api.split.categories[":id"].$patch({ param: { id }, json: editable(changes) })),
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

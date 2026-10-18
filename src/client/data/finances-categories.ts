import { useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { type InlineAdd, trackInlineAdd } from "@/data/inline-adds"
import { nowInstant } from "@shared/dates"
import type { CategoryRow, UpdateCategory } from "@shared/finances/schemas"
import { newId } from "@shared/ids"

export type Category = CategoryRow

function editable(changes: Partial<CategoryRow>): UpdateCategory {
  const { name, archived } = changes
  return {
    ...(name === undefined ? {} : { name }),
    ...(archived === undefined ? {} : { archived }),
  }
}

const financesCategories = defineRestCollection<CategoryRow>({
  id: "finances-categories",
  queryKey: ["finances", "categories"],
  fetchRows: async () =>
    (await readJson(await api.finances.categories.query.$post({ json: {} }))).rows,
  create: async ({ id, name }) =>
    readJson(await api.finances.categories.$post({ json: { id, name } })),
  update: async (id, changes) =>
    readJson(
      await api.finances.categories[":id"].$patch({ param: { id }, json: editable(changes) }),
    ),
  // Categories are never deleted (archive or merge instead), so nothing calls this.
  remove: () => Promise.reject(new Error("Categories are never deleted")),
})

/** Every Category, archived included, by name, live. */
export function useCategories() {
  const categories = financesCategories()
  return useLiveQuery(
    (q) => q.from({ category: categories }).orderBy(({ category }) => category.name, "asc"),
    [categories],
  )
}

/**
 * Shows the new Category at once and returns its id, with whether the server stored it; a refusal
 * rolls it back with a toast.
 */
export function addCategory(name: string): InlineAdd {
  const now = nowInstant()
  const id = newId()
  const transaction = financesCategories().insert({
    id,
    name,
    archived: false,
    mergedIntoId: null,
    createdAt: now,
    updatedAt: now,
  })
  return trackInlineAdd(id, transaction)
}

export function renameCategory(id: string, name: string): void {
  financesCategories().update(id, (draft) => {
    draft.name = name
  })
}

export function setCategoryArchived(id: string, archived: boolean): void {
  financesCategories().update(id, (draft) => {
    draft.archived = archived
  })
}

import { useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { type InlineAdd, trackInlineAdd } from "@/data/inline-adds"
import { nowInstant } from "@shared/dates"
import type { AccountRow, UpdateAccount } from "@shared/finances/schemas"
import { newId } from "@shared/ids"

export type FinancesAccount = AccountRow

function editable(changes: Partial<AccountRow>): UpdateAccount {
  const { name, note, archived } = changes
  return {
    ...(name === undefined ? {} : { name }),
    ...(note === undefined ? {} : { note }),
    ...(archived === undefined ? {} : { archived }),
  }
}

const financesAccounts = defineRestCollection<AccountRow>({
  id: "finances-accounts",
  queryKey: ["finances", "accounts"],
  fetchRows: async () =>
    (await readJson(await api.finances.accounts.query.$post({ json: {} }))).rows,
  create: async ({ id, name, note }) =>
    readJson(await api.finances.accounts.$post({ json: { id, name, note } })),
  update: async (id, changes) =>
    readJson(await api.finances.accounts[":id"].$patch({ param: { id }, json: editable(changes) })),
  remove: async (id) => readJson(await api.finances.accounts[":id"].$delete({ param: { id } })),
})

/** Every Account, archived included, by name, live. */
export function useFinancesAccounts() {
  const accounts = financesAccounts()
  return useLiveQuery(
    (q) => q.from({ account: accounts }).orderBy(({ account }) => account.name, "asc"),
    [accounts],
  )
}

/**
 * Shows the new Account at once and returns its id, with whether the server stored it; a refusal
 * rolls it back with a toast.
 */
export function addFinancesAccount(name: string): InlineAdd {
  const now = nowInstant()
  const id = newId()
  const transaction = financesAccounts().insert({
    id,
    name,
    note: "",
    archived: false,
    createdAt: now,
    updatedAt: now,
  })
  return trackInlineAdd(id, transaction)
}

export function renameFinancesAccount(id: string, name: string): void {
  financesAccounts().update(id, (draft) => {
    draft.name = name
  })
}

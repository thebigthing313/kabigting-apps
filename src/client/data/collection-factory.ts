// Every writable collection is built here: an eager Query Collection over the App's REST routes,
// optimistic by default. A handler persists the change, writes the server's row back into the
// synced store, and skips the refetch. A thrown error rolls the optimistic change back.
import { createCollection } from "@tanstack/db"
import { queryCollectionOptions } from "@tanstack/query-db-collection"
import { reportError } from "@/data/error-handler"
import { queryClient } from "@/data/query-client"

export type RestCollectionSpec<Row extends { id: string }> = {
  /** Unique across the app, e.g. "skeleton-notes". */
  id: string
  queryKey: readonly string[]
  fetchRows: () => Promise<Row[]>
  /** Each write returns the full row as the server stored it. */
  create: (row: Row) => Promise<Row>
  update: (id: string, changes: Partial<Row>) => Promise<Row>
  remove: (id: string) => Promise<Row>
}

function buildCollection<Row extends { id: string }>(spec: RestCollectionSpec<Row>) {
  return createCollection(
    queryCollectionOptions({
      id: spec.id,
      queryKey: [...spec.queryKey],
      queryClient,
      getKey: (row: Row) => row.id,
      queryFn: () => spec.fetchRows(),
      onInsert: async ({ transaction, collection }) => {
        try {
          for (const mutation of transaction.mutations) {
            await collection.utils.writeUpsert(await spec.create(mutation.modified))
          }
        } catch (error) {
          reportError(error, "Saving")
          throw error
        }
        return { refetch: false }
      },
      onUpdate: async ({ transaction, collection }) => {
        try {
          for (const mutation of transaction.mutations) {
            await collection.utils.writeUpsert(await spec.update(mutation.key, mutation.changes))
          }
        } catch (error) {
          reportError(error, "Saving")
          throw error
        }
        return { refetch: false }
      },
      onDelete: async ({ transaction, collection }) => {
        try {
          for (const mutation of transaction.mutations) {
            await spec.remove(mutation.key)
            await collection.utils.writeDelete(mutation.key)
          }
        } catch (error) {
          reportError(error, "Deleting")
          throw error
        }
        return { refetch: false }
      },
    }),
  )
}

export type RestCollection<Row extends { id: string }> = ReturnType<typeof buildCollection<Row>>

const live = new Map<string, { cleanup: () => Promise<void> }>()

/**
 * A lazily created collection. Call the getter only after sign-in and the App's access check;
 * after `cleanupCollections` it builds a fresh, empty collection.
 */
export function defineRestCollection<Row extends { id: string }>(spec: RestCollectionSpec<Row>) {
  let current: RestCollection<Row> | null = null
  return function getCollection(): RestCollection<Row> {
    if (!current || !live.has(spec.id)) {
      current = buildCollection(spec)
      live.set(spec.id, current)
    }
    return current
  }
}

/** Drops every collection's rows and stops their syncing (sign-out). */
export async function cleanupCollections(): Promise<void> {
  const collections = [...live.values()]
  live.clear()
  await Promise.all(collections.map((collection) => collection.cleanup()))
}

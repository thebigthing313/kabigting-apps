// Every writable collection is built here: a Query Collection over the App's REST routes,
// optimistic by default. A handler persists the change, writes the server's row back into the
// synced store, and skips the refetch. A thrown error rolls the optimistic change back.
//
// Small collections load eagerly, all rows at once. Large ones load on demand: each live query's
// where, orderBy and limit become a server query, so only the rows on screen are fetched.
import { BasicIndex, createCollection } from "@tanstack/db"
import { type QueryCollectionConfig, queryCollectionOptions } from "@tanstack/query-db-collection"
import type { QueryClient, QueryFunctionContext, QueryKey } from "@tanstack/react-query"
import { reportError } from "@/data/error-handler"
import { toOnDemandQueries } from "@/data/on-demand-query"
import { queryClient } from "@/data/query-client"
import type { OnDemandQuery } from "@shared/finances/schemas"

type RestWrites<Row extends { id: string }> = {
  /** Unique across the app, e.g. "finances-wallets". */
  id: string
  queryKey: readonly string[]
  /** Each write returns the full row as the server stored it. */
  create: (row: Row) => Promise<Row>
  update: (id: string, changes: Partial<Row>) => Promise<Row>
  remove: (id: string) => Promise<Row>
}

export type RestCollectionSpec<Row extends { id: string }> = RestWrites<Row> & {
  fetchRows: () => Promise<Row[]>
}

export type OnDemandCollectionSpec<Row extends { id: string }> = RestWrites<Row> & {
  /** One server query in the fixed filter set. */
  fetchRows: (query: OnDemandQuery) => Promise<Row[]>
}

function writeHandlers<Row extends { id: string }>(spec: RestWrites<Row>) {
  return {
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
  } satisfies Pick<WriteConfig<Row>, "onInsert" | "onUpdate" | "onDelete">
}

/** A collection keyed by its rows' string ids. */
type WriteConfig<Row extends { id: string }> = QueryCollectionConfig<
  Row,
  (context: QueryFunctionContext) => Promise<Row[]>,
  unknown,
  QueryKey,
  string
>

function buildCollection<Row extends { id: string }>(spec: RestCollectionSpec<Row>) {
  return createCollection(
    queryCollectionOptions({
      id: spec.id,
      queryKey: [...spec.queryKey],
      queryClient,
      getKey: (row: Row) => row.id,
      queryFn: () => spec.fetchRows(),
      ...writeHandlers(spec),
    }),
  )
}

/** An on-demand collection on the given client; exported for tests. */
export function buildOnDemandCollection<Row extends { id: string; date: string }>(
  spec: OnDemandCollectionSpec<Row>,
  client: QueryClient,
) {
  const collection = createCollection(
    queryCollectionOptions({
      id: spec.id,
      queryKey: [...spec.queryKey],
      queryClient: client,
      syncMode: "on-demand",
      getKey: (row: Row) => row.id,
      queryFn: async ({ meta }) => {
        const queries = toOnDemandQueries(meta?.loadSubsetOptions ?? {})
        const pages = await Promise.all(queries.map((query) => spec.fetchRows(query)))
        // A paged load asks twice; the two answers never overlap, but be sure.
        return [...new Map(pages.flat().map((row) => [row.id, row])).values()]
      },
      ...writeHandlers(spec),
    }),
  )
  // Without an ordered index on date, a live query with orderBy and limit would load every
  // matching row instead of a page.
  collection.createIndex((row) => row.date, { indexType: BasicIndex })
  return collection
}

export type RestCollection<Row extends { id: string }> = ReturnType<typeof buildCollection<Row>>
export type OnDemandCollection<Row extends { id: string; date: string }> = ReturnType<
  typeof buildOnDemandCollection<Row>
>

const live = new Map<string, { cleanup: () => Promise<void> }>()

function lazily<Collection extends { cleanup: () => Promise<void> }>(
  id: string,
  build: () => Collection,
): () => Collection {
  let current: Collection | null = null
  return function getCollection(): Collection {
    if (!current || !live.has(id)) {
      current = build()
      live.set(id, current)
    }
    return current
  }
}

/**
 * A lazily created collection. Call the getter only after sign-in and the App's access check;
 * after `cleanupCollections` it builds a fresh, empty collection.
 */
export function defineRestCollection<Row extends { id: string }>(spec: RestCollectionSpec<Row>) {
  return lazily(spec.id, () => buildCollection(spec))
}

/** As `defineRestCollection`, for a collection that loads only what live queries ask for. */
export function defineOnDemandCollection<Row extends { id: string; date: string }>(
  spec: OnDemandCollectionSpec<Row>,
) {
  return lazily(spec.id, () => buildOnDemandCollection(spec, queryClient))
}

/** Drops every collection's rows and stops their syncing (sign-out). */
export async function cleanupCollections(): Promise<void> {
  const collections = [...live.values()]
  live.clear()
  await Promise.all(collections.map((collection) => collection.cleanup()))
}

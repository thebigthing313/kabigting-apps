# Research 02: TanStack DB for an online-first app (Hono + Postgres, one Railway service)

Ticket: [02-tanstack-db-online-first](../issues/02-tanstack-db-online-first.md)
Researched: 2026-10-14. Versions are from `npm view` on that date.

## Answer in brief

- **Maturity:** still pre-1.0 and labelled beta. `@tanstack/db` is `0.14.0`, `@tanstack/react-db` is `0.5.9`. The first-party README says "Tanstack DB is currently in BETA". Releases ship almost daily, so pin exact versions.
- **Recommended collection for the Walking skeleton:** `@tanstack/query-db-collection` (Query Collection) over plain Hono REST endpoints. It runs inside the single Railway service with no extra infrastructure. The package is `1.4.4`, but the docs still call its refetch behaviour "pre-1.0".
- **Electric Collection** is the only option that gives real Postgres-to-client sync, but it needs a second Railway service (Electric, with a persistent volume) and Postgres with logical replication. That is more than an online-first cache needs. Defer it.
- **Persistence is optional.** In-memory plus revalidate-on-load matches the "online-first, fast client cache" decision. Browser SQLite/OPFS persistence exists but is a separate opt-in layer.
- **Offline transactions** (`@tanstack/offline-transactions`) are not needed. Offline writes are out of scope in the map.

## 1. Maturity and versions

| Package | Latest (2026-10-14) | Role |
| --- | --- | --- |
| `@tanstack/db` | 0.14.0 | core |
| `@tanstack/react-db` | 0.5.9 | React bindings (`useLiveQuery`), peer `react >=18` |
| `@tanstack/query-db-collection` | 1.4.4 | REST/RPC collection, peer `@tanstack/query-core ^5.90.15` |
| `@tanstack/electric-db-collection` | 0.6.0 | Electric collection |
| `@tanstack/browser-db-sqlite-persistence` | 0.2.34 | OPFS SQLite persistence, peer `@journeyapps/wa-sqlite ^1.4.1` |
| `@tanstack/offline-transactions` | 1.1.1 | durable mutation outbox |
| `@tanstack/react-query` | 5.104.2 | optional; not needed by DB itself |

- The repo README states beta status: [github.com/TanStack/db](https://github.com/TanStack/db). The latest GitHub release at research time was `@tanstack/svelte-db@0.5.9`: [releases](https://github.com/TanStack/db/releases).
- Pre-1.0 is stated in the docs themselves. [Query Collection docs](https://tanstack.com/db/latest/docs/collections/query-collection) say auto-refetch after handlers is "Current (pre-1.0)" and will be removed at v1.0. The [mutations guide](https://tanstack.com/db/latest/docs/guides/mutations) says `tx.isPersisted.promise` is deprecated and will be removed in the 1.0 RC.
- React Compiler: issue [#391](https://github.com/TanStack/db/issues/391) ("`useLiveQuery` isn't working properly with React Compiler") was closed in Aug 2025. The reporter could no longer reproduce it, so no confirmed fix exists. The `react-db` package.json tests against React 19.2 ([package.json](https://github.com/TanStack/db/blob/main/packages/react-db/package.json)). Verify with a smoke test in the skeleton.
- TypeScript 7 is untested here. The packages only declare `typescript >=4.7` as a peer dependency.

## 2. Core API (React)

Sources: [Overview](https://tanstack.com/db/latest/docs/overview), [Installation](https://github.com/TanStack/db/blob/main/docs/installation.md), [Live queries](https://tanstack.com/db/latest/docs/guides/live-queries).

- Install: `@tanstack/react-db` (re-exports `@tanstack/db`), plus a collection package.
- **Collection:** typed set of rows. **Live query:** reactive, incrementally updated query across collections (joins supported). The docs cite roughly 0.7 ms to update one row in a sorted 100k-row collection.
- `useLiveQuery(q => q.from(...).where(...))` returns `data` plus `isLoading`, `status`, `isReady`, `isError`, and so on.
- Sync modes: `eager` (default, load everything), `on-demand` (load only what queries request), `progressive`.
- Schemas: optional, any Standard Schema library (fits the validation gap on the map).

## 3. Query Collection over Hono REST (recommended)

Source: [Query Collection](https://tanstack.com/db/latest/docs/collections/query-collection) (raw: [query-collection.md](https://github.com/TanStack/db/blob/main/docs/collections/query-collection.md)).

```sh
npm install @tanstack/react-db @tanstack/query-db-collection @tanstack/query-core
```

- Required options: `queryKey`, `queryFn`, `queryClient`, `getKey`. It forwards TanStack Query options (`staleTime`, `gcTime`, `refetchOnWindowFocus`, `refetchOnReconnect`, `refetchInterval`, `networkMode`, and others). `placeholderData` is not supported.
- `queryFn` result is the **complete state** of the collection. Rows missing from the result are deleted, and an empty array deletes everything. Do not point one collection at several endpoints with partial results.
- Any HTTP endpoint works: the docs only show `fetch("/api/todos")`. They do not mention Hono or tRPC. A Hono RPC client or plain `fetch` both fit, because the contract is just "return `Array<Row>`".
- `on-demand` mode pushes `where`, `orderBy`, `limit` and `offset` to `queryFn` via `ctx.meta.loadSubsetOptions`, with helpers such as `parseLoadSubsetOptions`. This is only needed for large tables. For the skeleton, use `eager`.
- Cancellation: forward `ctx.signal` to `fetch`.
- SSR/multi-tenant: the docs describe a request-scoped `DbClient` holding the `QueryClient`. A client-only SPA can use a module-level `QueryClient`.

### Mutations, optimistic updates, rollback

Source: [Mutations guide](https://tanstack.com/db/latest/docs/guides/mutations).

- `collection.insert/update/delete` applies state optimistically at once. `onInsert/onUpdate/onDelete({ transaction })` persist to the backend, reading `transaction.mutations` (`type`, `original`, `modified`, `changes`, `key`).
- If the handler throws, the optimistic state rolls back. The docs say failed mutations are not retried automatically.
- States: `pending` -> `persisting` -> `completed` or `failed`. Await with `await tx.when('settled')`.
- Handlers should wait for server data to flow back before resolving. For Query Collection, that means a refetch or a direct write.
- Currently (pre-1.0) a refetch runs automatically after each handler. Return `{ refetch: false }` to skip it. At v1.0, auto-refetch goes away and you call `collection.utils.refetch()` yourself. Writing handlers with an explicit choice now avoids a later change.
- Direct writes (`utils.writeInsert/writeUpdate/writeDelete/writeUpsert/writeBatch`) patch the synced store without a refetch. They suit the case where the Hono endpoint returns the saved row: `await collection.utils.writeUpsert(serverRow)` in the handler.
- `createOptimisticAction` (`onMutate` + `mutationFn`) suits multi-collection intents. `createTransaction` gives manual control.
- Do not `await preload()` inside a handler, because it can deadlock.

Assessment for this stack: the Hono endpoints should return the written row (including server-generated fields), so the handler can `writeUpsert` it and skip a full refetch.

## 4. Electric Collection (not recommended for the skeleton)

Sources: [Electric Collection](https://tanstack.com/db/latest/docs/collections/electric-collection), [Electric deployment guide](https://electric.ax/docs/guides/deployment) (electric-sql.com redirects there).

- Needs an Electric sync service in front of Postgres, reached through a **server proxy** that applies auth and sets `table`/`where`. Hono could host that proxy.
- Mutation handlers return a Postgres txid (`pg_current_xact_id()::xid::text` in the **same transaction** as the write) and call `collection.utils.awaitTxId(txid)`. A mismatch fails as a silent stall until timeout. Alternative: `awaitMatch(predicate)` with a 15 s default timeout.
- Electric requirements: Postgres 14+, logical replication enabled, a role with `REPLICATION`, a **direct** (non-pooled) connection, a persistent filesystem (`ELECTRIC_STORAGE_DIR`), and a separate Docker service (`electricsql/electric`) with an exposed HTTP port. Disk speed matters most.
- **One Railway service?** No. Electric is a second service. Railway publishes [Electric templates](https://railway.com/deploy/electricsql) that run Postgres with `wal_level=logical` alongside Electric. Railway's [PostgreSQL guide](https://docs.railway.com/guides/postgresql) does not mention `wal_level`, so whether the stock Railway Postgres service allows logical replication is unconfirmed from first-party docs. A community post ([station.railway.com](https://station.railway.com/questions/i-need-wal-level-logical-enabled-on-2-po-859adf48)) suggests `ALTER SYSTEM` plus a restart; treat that as unverified.
- Benefit it would add: live multi-device updates, which an online-first single-family app can approximate cheaply with refetch-on-focus. Revisit if multi-user realtime becomes a requirement.

## 5. Other collections

From the [Overview](https://tanstack.com/db/latest/docs/overview) and [collections docs](https://github.com/TanStack/db/tree/main/docs/collections):

- **TrailBase** (`0.1.120`), **RxDB** (`0.1.108`, peer `rxdb >=17`), **PowerSync** (`0.2.10`): all require their own backend or sync layer, which conflicts with Hono + Postgres on one service.
- **LocalOnly / LocalStorage / IndexedDB** collections: useful for UI state or settings, not server data.

## 6. Persistence

Source: [SQLite persistence guide](https://github.com/TanStack/db/blob/main/docs/guides/sqlite-persistence.md).

- Browser option: `@tanstack/browser-db-sqlite-persistence` with `@journeyapps/wa-sqlite` and OPFS. It needs a secure context and OPFS support, and has a multi-tab setup. Wrap a Query Collection with `persistedCollectionOptions({ ...queryCollectionOptions(...), persistence, schemaVersion })`. `initialRender: { strategy: 'network-first', networkTimeoutMs }` is available, but only for eager collections.
- Notes: every persisted collection needs a stable `id` and a `schemaVersion` bumped on shape changes. An on-demand SQLite cache "is not yet a certified offline snapshot".
- This adds moving parts (WASM, OPFS, schema versions) for little gain when data must revalidate anyway. For the skeleton: start with in-memory collections. The PWA caches the Shell (app code), not data. Add SQLite persistence later only if cold-start flash matters.
- Offline outbox: [`@tanstack/offline-transactions`](https://tanstack.com/db/latest/docs/guides/offline-transactions) is explicitly separable from persistence and not required. The docs say that when offline mode is disabled, actions use the normal online mutation path. Skip it (out of scope per the map).

## 7. Fit with the decided stack

- **One Railway service:** Query Collection works with Hono serving `/api/*` and the SPA from one origin, with Railway Postgres beside it. Electric would add a second service and a volume.
- **Auth:** Query Collection calls ordinary Hono routes, so Better Auth session cookies on the same origin apply to every `queryFn` and handler with no extra work.
- **Revalidation:** set `staleTime`, `refetchOnWindowFocus` and `refetchOnReconnect` per collection to give "fast cache that revalidates from the server".

## 8. Recommendation and open items for the build spec

1. Use `@tanstack/react-db` + `@tanstack/query-db-collection` + `@tanstack/query-core`, with exact version pins. Beta churn is daily.
2. One eager Query Collection for the Walking skeleton's single read-one-record slice. `queryFn` -> Hono `GET /api/...`; mutation handlers -> Hono `POST/PATCH/DELETE` returning the written row, then `writeUpsert` (or `{ refetch: false }` plus an explicit refetch).
3. No Electric, no SQLite persistence, no offline-transactions in the skeleton. Record them as revisit triggers: multi-user realtime, cold-start latency, offline writes.
4. Smoke-test in the skeleton: React Compiler plus `useLiveQuery`, and TypeScript 7 type-checking of the DB packages. Neither is verified by a primary source.
5. Open: whether `@tanstack/react-query` is also wanted for non-collection fetches. DB only needs `@tanstack/query-core`.

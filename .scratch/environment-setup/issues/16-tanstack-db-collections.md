# Grill: TanStack DB role and collections
Type: grilling
Status: resolved
Blocked by: 02

## Question

Using the research findings, settle the sync approach, collection conventions, the mutation/optimistic-update pattern, and what the Walking skeleton's collection round trip looks like.

## Answer

Decided with the user (Q2 amended by the user; the rest accepted as recommended).

- **Role and sync:** TanStack DB is the client cache over an eager Query Collection (`@tanstack/query-db-collection`) on plain Hono REST. Electric and local persistence stay deferred.
- **Data volume:** eager loading for the skeleton and small reference data. The big transactions table should load a bounded window with older ranges on demand; that is the finances port's decision, so each collection's `queryFn` must accept parameters. (Row count of the Access database was not provided; revisit at the port.)
- **API shape (amended):** reads are POST, not GET, so long filters (e.g. a long list of UUIDs) never hit URL length limits. Per resource, per App: `POST /api/<app>/<resource>/query` (JSON body of filters) to read, `POST /api/<app>/<resource>` to create, `PATCH /api/<app>/<resource>/:id` to update, `DELETE /api/<app>/<resource>/:id` to delete. Every write returns the full written row. A collection's `queryFn` calls the typed Hono RPC client. The `/query` body schema is shared between client and server; validation and error shapes are ticket 10's.
- **Consequences of POST reads:** HTTP and service-worker caches will not cache them, which is acceptable for online-first because TanStack Query is the cache. Same-origin cookies and Better Auth origin checks still apply.
- **Mutations:** optimistic by default; handlers return the written row and call `writeUpsert` (or return `{refetch: false}`); a thrown error rolls back; a toast shows on failure. All writable collections go through one factory in `src/client/data/`.
- **IDs (confirms ticket 09):** the client generates UUIDv7 via the `uuid` package, wrapped in `src/shared/ids.ts`; the server validates it.
- **Skeleton record:** a disposable `skeleton_notes` table (id, text, `amount_cents`, `on_date`, `created_at`) under App key `skeleton`, with create, edit and delete on a simple page, exercising money, dates, `app_access`, optimistic update and rollback. Deleted when the finances port begins.
- **Glossary:** when the port starts, Finances gets its own context file with its own vocabulary (financial accounts there; a sign-in **Account** here), with a `CONTEXT-MAP.md` added then. Nothing to change now.
- **Freshness:** refetch on window focus and on reconnect; no polling, websockets or SSE; no persistence (memory-only cache); the service worker caches the app shell only. Concurrent edits: last write wins.
- **Session:** sign-out clears the query cache, cleans up every collection, and does a full navigation. A 401 goes to sign-in and a "password change required" 403 goes to the change-password screen, both through one global error handler. An App's collections are created only after sign-in and a passing `app_access` check.
- **Beta containment:** pin exact versions (no `^`), upgrade deliberately, keep every TanStack DB import inside `src/client/data/`. The skeleton must smoke-test a `useLiveQuery` component under React Compiler and collection types under TS 7.

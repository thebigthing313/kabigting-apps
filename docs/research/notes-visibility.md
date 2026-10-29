# Research: per-note visibility on the server and in the client data layer

Answers issue #117 (child of the Notes App wayfinder map, #114). Sources are this repository's
code at `develop` (commit `87b888b`) and the installed sources of the pinned packages in
`node_modules` (`@tanstack/query-db-collection` 1.4.4, `@tanstack/db` 0.14.0,
`@tanstack/query-core` 5.104.2 under `@tanstack/react-query` 5.104.2, `drizzle-orm` 0.45.4,
`hono` 4.13.13). Paths into packages are given relative to the package root.

Standing constraints from the map: the creator picks an Audience (any subset of Accounts holding
App access to Notes, possibly empty); the Audience sees and edits content; only the creator
changes the Audience or deletes; the Admin sees only notes they create or are in the Audience
of; no real-time co-editing. Audience edge cases (access loss, Removed Accounts) and the note
data shape are other tickets; dependencies on them are marked **[depends]**.

## 1. How things work today

### Server

- Every App router is built by `createAppRouter(appKey, deps)`
  (`src/server/core/create-app-router.ts`): body limit, `requireSession`, `mustChangePassword`,
  then `requireApp(appKey, db)`.
- `requireApp` (`src/server/core/require-app.ts`) is all-or-nothing per App: the Admin passes
  through on `role === "admin"`; anyone else needs an `app_access` row
  (`src/server/db/schema/access.ts`, primary key `(userId, appKey)`, `userId` references
  `auth_user.id` with `onDelete: "cascade"`). Failure is `403 forbidden_app`.
- After the guard, routes put the signed-in Account on the context as `c.get("account")`
  (`{ id, email, name, role }`, `src/server/core/context.ts`). Finances routes never read it:
  `src/server/db/schema/finances.ts` says "Every row is shared household data, so no table has an
  owner column", and `categoryRoutes` (`src/server/apps/finances/categories.ts`) is the typical
  shape:
  - `POST /query` with `{ ids?, limit?, after? }` returns `{ rows }`, ordered by id, capped at
    `MAX_QUERY_IDS`.
  - `POST /` takes a client-made UUIDv7 id; `onConflictDoNothing` on the id makes a reused id a
    `409 conflict`, never an overwrite.
  - `PATCH /:id` and `DELETE /:id` filter by id alone and return `404 not_found` when nothing
    matched.
  - Error codes are the fixed set in `src/shared/api-error.ts` (`forbidden_app`, `not_found`,
    `conflict`, ...).

### Client

- `src/client/data/collection-factory.ts` builds every writable collection with
  `queryCollectionOptions` from `@tanstack/query-db-collection` on the shared `queryClient`.
  - Eager (`defineRestCollection`): one `queryFn` returning every row.
  - On demand (`defineOnDemandCollection`, `syncMode: "on-demand"`): each live query's
    `where`/`orderBy`/`limit` is translated by `src/client/data/on-demand-query.ts` into a fixed
    server filter set; it needs a `date` field and refuses anything else.
  - Writes are optimistic. Each handler calls the REST route, writes the server's row back with
    `collection.utils.writeUpsert`/`writeDelete`, and returns `{ refetch: false }`. A thrown error
    rolls the optimistic change back and shows a toast via `reportError`.
  - Collections are lazy singletons, dropped by `cleanupCollections()` at sign-out.
- `src/client/data/query-client.ts` sets the policy: `staleTime: 30_000`,
  `refetchOnWindowFocus: true`, `refetchOnReconnect: true`, `refetchInterval: false` ("never
  poll"), no retry on 4xx.
- `src/client/data/api.ts` is the Hono typed client (`hc<AppType>`).

## 2. What the pinned libraries guarantee

1. **A query collection's `queryFn` result is the complete state, and missing rows are deleted.**
   The config type documents `queryFn` as "Function that fetches data from the server. Must
   return the complete collection state" (`src/query.ts`, `QueryCollectionConfig.queryFn`, about
   line 137). In the result-application code (`src/query.ts`, about lines 2548-2570), each row the
   query previously owned that is absent from the new result loses that owner and, with no owner
   left, gets `write({ type: "delete", key })`. So in an eager collection, **a note that drops out
   of the server's answer disappears from the client on the next refetch** with no extra code.
2. **Rows written directly are claimed by the next fetch.** A row put in with `writeUpsert` (as
   the create handler does) is tracked as an "unowned direct write"; a later fetch that contains
   it takes ownership and replaces it with the server value (`src/query.ts`, about lines
   2575-2610). A note the creator just made is therefore not lost on refetch, because the server
   returns it to the creator.
3. **The collection uses an ordinary TanStack Query `QueryObserver`** on our `queryClient`
   (`src/query.ts`, about line 2119). `QueryObserver` runs its options through
   `client.defaultQueryOptions` (`query-core/src/queryObserver.ts`, lines 201 and 421), so the
   app-wide `refetchOnWindowFocus`/`refetchOnReconnect`/`staleTime` defaults already apply to a
   Notes collection. The collection also accepts per-collection `refetchInterval`, `staleTime`,
   `refetchOnWindowFocus` and so on (the `queryObserverOptionKeys` list, `src/query.ts`, about
   line 73).
4. **Focus means page visibility.** `focusManager` listens to `visibilitychange`
   (`query-core/src/focusManager.ts`, line 28). An interval refetch runs only while focused unless
   `refetchIntervalInBackground` is set (`query-core/src/queryObserver.ts`, about line 555).
5. **Manual refresh** is `collection.utils.refetch()` (`QueryCollectionUtils.refetch`,
   `src/query.ts` line 309), or `queryClient.invalidateQueries({ queryKey: [...] })`, which the
   collection's observer handles (`src/query.ts`, comments near lines 3379 and 3655).

Nothing in the pinned stack pushes server changes to the client. Without SSE or WebSockets
(none exist in the repo) a client only learns of a change when it refetches.

## 3. Server: filtering by Audience

### Schema

Two tables (column details for content belong to the data-shape ticket **[depends]**):

```ts
// notes: one row per note
notes = pgTable("notes", {
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`), // client-supplied, as in Finances
  creatorId: text()
    .notNull()
    .references(() => auth_user.id), // onDelete: [depends]
  // type, title, body / Items ... [depends: data-shape ticket]
  createdAt,
  updatedAt,
})

// notes_audience: one row per (note, Account it is shared with)
notesAudience = pgTable(
  "notes_audience",
  {
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => auth_user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.userId] }), index().on(t.userId)],
)
```

- The creator is a column, not an Audience row. "Only the creator changes the Audience or
  deletes" then reads as one comparison, and the creator cannot be removed from their own note.
  An empty Audience is simply no rows (private).
- A join table rather than a `text[]` column on `notes` gives referential integrity to
  `auth_user`, an index on `userId` for "notes shared with me", and the same `(x, userId)`
  primary-key pattern `app_access` already uses. A Postgres array would need a GIN index and
  loses the foreign key.
- `creatorId` `onDelete` and whether `notes_audience.userId` cascades depend on the
  access-loss/Removed-Account ticket **[depends]**. Accounts are not deleted today (Removed
  Accounts keep their data), so the choice is mostly about intent.

### The visibility predicate

One helper used by every route, so no route can forget it:

```ts
// visible to `accountId`: created by them, or they are in the Audience
function visibleTo(accountId: string) {
  return or(
    eq(notes.creatorId, accountId),
    exists(
      db
        .select({ one: sql`1` })
        .from(notesAudience)
        .where(and(eq(notesAudience.noteId, notes.id), eq(notesAudience.userId, accountId))),
    ),
  )
}
```

- `POST /query`: `where(and(visibleTo(account.id), ...filters))`. It returns each note with its
  Audience as `audience: string[]` (a second query on `notes_audience` for the page's ids, or
  `array_agg` in a lateral join). The client needs the Audience to show "shared with" and to let
  the creator edit it.
- The Admin gets no bypass. `requireApp` still lets the Admin open the App, but `visibleTo` is
  applied for every role, which satisfies "private means private". This is the first place a
  route treats the Admin like anyone else, and the code should say so.
- `PATCH /:id` (content): `update ... where(and(eq(notes.id, id), visibleTo(account.id)))`. No row
  updated means `404 not_found`, the same answer whether the note does not exist or is not shared
  with the caller, so its existence is not leaked.
- `DELETE /:id` and `PUT /:id/audience`: `where(and(eq(notes.id, id), eq(notes.creatorId,
account.id)))`. To tell "not yours" from "not there", first check `visibleTo`: an Audience
  member who tries gets `403` (a new code such as `forbidden_note`, or reuse `conflict` with a
  message) and anyone else gets `404`. The client hides these controls for non-creators anyway,
  so the check only guards the API.
- `POST /` (create): `creatorId` comes from `c.get("account").id`, never from the body. On an id
  conflict, return `409` without echoing the existing row, as Finances does.
- Audience validation on create and on `PUT /:id/audience`: every id must hold App access to
  Notes, which is an `app_access` row with `appKey = "notes"` or the Admin role (mirror
  `requireApp`). The creator is dropped from or refused in the list. Replace the whole Audience
  in one transaction (delete the note's rows, insert the new set) and bump `notes.updatedAt` so
  the change shows up as a row change on other clients. What happens when an Audience member
  later loses App access is **[depends]**. The cheapest consistent rule is to apply it at read
  time by joining `app_access` in `visibleTo`, or to delete the rows in `setAppAccess`
  (`src/server/auth/accounts.ts`). The other ticket decides which.
- Picking an Audience needs a route that lists the Accounts holding Notes access (id and name)
  to any Notes user. Today only the Admin can list Accounts (`admin-routes.ts`), so this is a new
  Notes-scoped route, `GET /api/notes/people`, behind `createAppRouter("notes", ...)`.

The predicate is an `OR` of an indexed column and an indexed `EXISTS`. At household scale
(tens to hundreds of notes) it costs nothing, and no denormalised "visible_to" table is needed.

### Alternative considered: Postgres row-level security

RLS would enforce visibility in the database. It needs a per-request `SET LOCAL` of the Account
id inside a transaction on every query, and the app connects as one role through Drizzle's `pg`
pool with no such plumbing. That is a big new seam for one App. A single `visibleTo` helper and
integration tests that assert a non-Audience Account and the Admin get `404`/empty cover the risk
more cheaply. Not recommended now.

## 4. Client: learning that a note was shared or unshared

### Recommended: one eager collection, refetched on focus and reconnect, plus a modest interval

- A Notes collection built with `defineRestCollection` (eager): `fetchRows` calls
  `POST /api/notes/query` and returns every note visible to the caller.
- By guarantee 1, when a note is unshared the next refetch's answer lacks it and TanStack DB
  deletes it locally. When a note is newly shared, it appears in the answer and is inserted. No
  tombstones, no "changed since" cursor, no special client code.
- When refetches happen:
  - Window focus and reconnect, already on app-wide (guarantee 3). Coming back to the PWA shows
    current sharing.
  - The creator's own Audience change is applied at once from the server's response with
    `writeUpsert`, like every other write.
  - Optionally, a per-collection `refetchInterval` (for example 60 s) while the Notes route is
    on screen. The interval stops in the background by default (guarantee 4). This departs from
    `query-client.ts`'s "never poll" policy, so it is a decision for the spec. Without it, two
    people both looking at Notes see each other's changes only on focus.
- Why eager and not on demand: `on-demand-query.ts` and `buildOnDemandCollection` assume a `date`
  field and Finances' filter set. A household's notes are few enough to load at once, and an
  eager full-state fetch is exactly what makes unsharing free. On demand, a row is removed only
  when the subset query that loaded it refetches, which makes unshare detection depend on which
  subsets are live.

### Edge behaviour with the recommended approach

- An edit to a note that was just unshared from you gets `404` from `PATCH`. The handler throws,
  the optimistic change rolls back, and a toast shows. Then call `collection.utils.refetch()` or
  `writeDelete(id)` on `404` so the stale note leaves the list right away instead of at the next
  focus. This is one small addition to the Notes collection's `update` (it could be a generic
  option on `RestWrites`).
- Concurrent edits by two Audience members are last write wins on the row (no co-editing, as
  scoped). How fine-grained that is (whole body, or per Item) belongs to the data-shape ticket
  **[depends]**.
- Sign-out already runs `cleanupCollections()`, so a different Account signing in on the same
  device never sees the previous Account's notes.
- If the Shell later adds offline persistence (map: "Offline behaviour"), the persisted cache
  would keep an unshared note until the next successful fetch. That is acceptable but worth
  noting **[depends: offline ticket]**.

### Alternatives considered

| Option                                                       | Learns of share/unshare           | Cost                                                                  | Verdict                                                                                                      |
| ------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Eager collection, focus/reconnect refetch (current defaults) | On return to the app or reconnect | None beyond the collection                                            | **Baseline, recommended**                                                                                    |
| Plus `refetchInterval` while Notes is open                   | Within the interval while visible | One small request per interval per open client; breaks "never poll"   | Recommended as an option for the spec to accept or reject                                                    |
| `queryClient.invalidateQueries(["notes"])` after own writes  | Only for your own writes          | Trivial                                                               | Unneeded: writes already `writeUpsert` the server row                                                        |
| Delta sync (`?since=updatedAt` plus tombstones for unshares) | Same moments as refetch           | Tombstone table or audit of Audience removals, and merge code         | Not worth it at household scale                                                                              |
| Server push (SSE "notes changed" ping, then refetch)         | Seconds                           | New long-lived connection, Railway proxy timeouts, auth on the stream | Defer. If wanted later, the ping only triggers `utils.refetch()`, so the server design above does not change |
| Electric / TanStack DB sync engine collection                | Live                              | New infrastructure, and per-row auth in the sync layer                | Out of proportion; real-time is out of scope                                                                 |

## 5. Recommendation

- **Server:** a `notes` table with `creatorId`, and a `notes_audience (noteId, userId)` join table
  that excludes the creator. One `visibleTo(accountId)` predicate (creator or Audience member,
  with **no Admin bypass**) is applied to every read and content write. Delete and Audience
  replacement are guarded by `creatorId = account.id`. A note you cannot see answers `404`; an
  Audience member attempting a creator-only action gets `403`. Audience ids are validated against
  Notes App access. A Notes-scoped "people" route serves the picker. Keep `requireApp` unchanged
  as the outer gate.
- **Client:** one eager `defineRestCollection` for notes, whose fetch returns the full visible
  set, so TanStack Query DB's full-state sync inserts newly shared notes and deletes unshared
  ones on each refetch. Rely on the existing focus and reconnect refetch. Treat a `404` on write
  as "gone": roll back, then remove or refetch. Decide in the spec whether to add a 60 s
  `refetchInterval` while Notes is open.
- **Glossary:** amend **App access** in `CONTEXT.md` ("shared by everyone holding the grant")
  to say that an App may narrow visibility per record, as Notes does with its Audience.

Trade-off summary: the design adds no infrastructure and reuses the factory unchanged. The
price is latency, since a share or unshare reaches another open client only on focus, reconnect
or the optional interval, and an unshared note can stay on screen until then. Its edits then fail
safely with `404`.

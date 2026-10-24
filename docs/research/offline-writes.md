# What happens to a write when the device is offline?

Research for issue #103, asked for the Baby App (diaper changes and feedings logged from a
nursery tablet whose Wi-Fi may drop). Sources are this repository at `develop` (after #95) and
the published npm packages at the versions pinned in `package.json`. There was no existing
research folder; this note starts `docs/research/`.

## Answer

Today the Shell is **online-only by design**, and a write never survives a lost connection:

- While the browser reports offline, the whole Shell is replaced by "You're offline", so no
  App form can even be opened.
- If the connection drops mid-request, the optimistic row appears, the request fails, the row
  is **rolled back**, and a toast says "Saving failed: You appear to be offline". Nothing is
  stored or retried. The person has to enter it again.

"Offline entries sync later" is **not a cheap extension**. TanStack DB has a first-party package
for it (`@tanstack/offline-transactions`, whose 1.1.1 release is built against our exact
`@tanstack/db` 0.14.0), but adopting it touches the Shell, the data layer and the server:

1. The root route must stop blocking every App while offline, and the session and App access
   checks must work without a network.
2. Baby writes must go through an executor with a durable IndexedDB outbox and named mutation
   functions, outside the `collection-factory.ts` handlers that every other collection uses.
3. Server create routes must treat a replayed create as success (today a repeated id is a 409).
4. The UI needs a "waiting to sync" state and a way to show a permanently refused entry,
   because the current toast-and-rollback contract no longer holds.
5. The list the person reads is not persisted, so after a reload offline it shows only the
   queued entries, not history, unless collection persistence is added as well.

Estimate: a medium-to-large, Shell-wide change, not a per-App flag. **The minimal honest
behaviour** for the first Baby App release is the current contract, made visible on the
tablet: the person can see they are offline before they tap, a failed save says so plainly, and
the form keeps what was typed so a retry is one tap. Durable offline queuing can then be a
separate, deliberate project.

## Findings

### 1. How `src/client/data/` writes today

- Every writable collection is a TanStack Query Collection built in
  `src/client/data/collection-factory.ts` (`queryCollectionOptions` from
  `@tanstack/query-db-collection` 1.4.4). The header states the contract: "optimistic by
  default... A thrown error rolls the optimistic change back."
- `writeHandlers()` supplies `onInsert`, `onUpdate` and `onDelete`. Each calls the App's REST
  route, writes the server's row back with `collection.utils.writeUpsert` / `writeDelete`, and
  returns `{ refetch: false }`. On any error it calls `reportError(error, "Saving" | "Deleting")`
  and **rethrows**, which makes TanStack DB roll back the optimistic mutation. There is no retry
  for mutations (the `retry` option in `src/client/data/query-client.ts` applies to queries only).
- Requests go through `apiFetch` in `src/client/data/error-handler.ts`. A `fetch` rejection (no
  network, connection dropped) becomes `ApiRequestError(0, "network", "You appear to be
offline")`. A 401 does a full navigation to sign-in; a 403 `password_change_required` goes to
  change-password.
- `reportError` shows a Sonner toast `"<action> failed"` with the error message, so offline
  mid-save the person sees **"Saving failed — You appear to be offline"** and the row
  disappears. Its own doc comment: "Tells the user a write failed (its optimistic change has
  been undone)."
- Callers learn the outcome via `settled()` in `src/client/data/settled.ts`
  (`transaction.when("settled")`): `true` once the server accepted, `false` after rollback. Forms
  such as `finances-wallets.ts` and `finances-transactions.ts` return that boolean.
- Ids are generated on the client (`newId()` in `src/shared/ids.ts`, UUIDv7). Server creates
  insert with `onConflictDoNothing` and answer a repeated id with a `conflict` error, e.g.
  `src/server/apps/finances/accounts.ts` ("an existing id is a conflict, never an overwrite").
- Nothing in the data layer is persisted on the device: collections live in memory and are
  cleaned up at sign-out (`cleanupCollections`).

### 2. What the Shell does while offline

- `src/client/routes/__root.tsx`: `Root` renders `online ? <Outlet /> : <OfflineScreen />`, using
  `useOnline()` (`navigator.onLine` plus `online`/`offline` events) from
  `src/client/shell/offline.tsx`. The root `errorComponent` also shows `OfflineScreen` for any
  network error. So **no App renders at all while the browser reports offline**; when it comes
  back, `router.invalidate()` reruns loaders.
- `OfflineScreen` says: "Kabigting Apps needs a connection to load your data."
- `src/client/data/session.ts` makes a failed session check throw a network error rather than
  read as signed out (also noted in `docs/versions.md`).
- Gap worth knowing: `navigator.onLine` is only a hint. Wi-Fi that stays associated but has no
  route to the server reports online, so the person reaches the form and the save then fails
  with the toast above.

### 3. Does the service worker cache anything?

- `vite.config.ts` configures `vite-plugin-pwa` 2.0.0 with `generateSW` and the comment "Only the
  app shell is cached; data always comes from the network": precache of
  `**/*.{js,css,html,svg,png,ico,woff2}`, `navigateFallback: "index.html"`, and
  `navigateFallbackDenylist: [/^\/api\//]`. No runtime caching and no Background Sync.
- `docs/versions.md` records the verification: the precache "holds only shell files (no `/api`
  ...)", and the shell opens offline with "You're offline" on Chromium and a real Android device.
- So the app shell loads offline; no API response and no write is cached or queued.

### 4. What TanStack DB offers at our pinned versions

Pins (`package.json`, `docs/versions.md`): `@tanstack/db` 0.14.0, `@tanstack/react-db` 0.5.9,
`@tanstack/query-db-collection` 1.4.4.

**`@tanstack/offline-transactions`** (not installed). `npm view` shows 1.1.1 (published
2026-10-14, minutes after db 0.14.0) depends on exactly `@tanstack/db` 0.14.0; 1.1.2+ moves to
db 0.15.x. Its React Native peers are optional. From the 1.1.1 package README and
`skills/offline/SKILL.md`:

- `startOfflineExecutor({ collections, mutationFns, storage?, shouldRetry?, ... })`, then
  `await executor.waitForInit()` (storage probe, leader election, outbox replay).
- Writes are made through `executor.createOfflineTransaction({ mutationFnName })` and
  `tx.mutate(() => collection.insert(...))`, i.e. **explicit offline transactions with named
  mutation functions**, not the collection's `onInsert` handler. The README's "Migration from
  TanStack DB" section shows this replacing a plain `collection.insert`.
- Durable outbox in IndexedDB with a localStorage fallback; the leader records each transaction
  before sending it; FIFO sequential processing; retry with exponential backoff and jitter;
  `NonRetriableError` for permanent failures, which rolls back the optimistic state and rejects
  the caller.
- On a fresh start the executor restores the optimistic state of queued transactions
  (`restoreOptimisticState` in `src/executor/TransactionExecutor.ts`), so queued entries
  reappear after a reload.
- Delivery is at least once: "providers must honor the supplied `idempotencyKey`". Without it,
  "retries can create duplicate records on the server."
- Only the leader tab persists; other tabs fall back to plain online-only transactions
  (`isOfflineEnabled` is false). One tablet with one tab is the easy case.
- Success means "the configured `mutationFn` returned and the storage adapter acknowledged
  outbox deletion"; the server has confirmed the write only if the `mutationFn` waits for it.
- The web online detector processes the outbox even when `navigator.onLine` is false if the tab
  is visible, relying on retries.

**Collection persistence in `@tanstack/db` 0.14.0.** The installed package exports
`indexedDBCollectionOptions` / `createIndexedDB` (a collection stored in IndexedDB) and marks its
persistence protocol (`sync-persistence.js`, `persisted-readiness.js`) as `@internal` /
"Unstable". There is no supported way at this version to persist a Query Collection's synced
rows so history is readable offline. A local-only IndexedDB collection could hold entries, but
syncing it to the server would be our own code.

### 5. What adopting offline writes would touch

| Area                                     | Change                                                                                                                                                                                       | Size                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `routes/__root.tsx`, `shell/offline.tsx` | Let an offline-capable App render offline instead of `OfflineScreen`                                                                                                                         | Small, but a Shell rule change |
| Session and App access check             | Cache the last known session and grant so the Baby route loads offline; handle a session that expired while queued (`apiFetch` would navigate to sign-in mid-replay)                         | Medium                         |
| `src/client/data/`                       | Add the package (pin 1.1.1, record in `docs/versions.md`), one executor started after sign-in and disposed with `cleanupCollections`, named mutation fns that call the API and `writeUpsert` | Medium                         |
| Retry policy                             | Map `ApiRequestError` 4xx to `NonRetriableError`, keep network/5xx retriable, decide what a 401 does                                                                                         | Small                          |
| Server Baby routes                       | Accept a replayed create: same id and same body returns the stored row instead of 409                                                                                                        | Small per route                |
| UI                                       | "Waiting to sync (n)" indicator, pending marker on rows, a visible place for refused entries (a toast may fire hours later or never be seen)                                                 | Medium                         |
| Sign-out                                 | Decide what happens to a non-empty outbox; today sign-out drops everything                                                                                                                   | Small, but a product decision  |
| Reading offline                          | History list empty after an offline reload unless persistence is added (internal API at 0.14)                                                                                                | Large, or accept it            |
| Tests                                    | Browser tests for offline queue, reload with queued entries, replay, refusal                                                                                                                 | Medium                         |

### 6. Minimal honest behaviour without the package

Using only what exists today:

- Keep the online-only contract and say so in the Baby App's docs.
- Do not lose what was typed: on `settled() === false`, keep the form values (the Finances forms
  already return the boolean) so retry is one tap.
- Show the connection state on the logging screen. The root route already swaps in
  `OfflineScreen` when `navigator.onLine` is false; for the mid-request case the existing toast
  ("Saving failed — You appear to be offline") is accurate.
- Make the Baby create routes accept a repeated id with the same body as success. That makes a
  manual retry after an ambiguous failure (request reached the server, response lost) safe, and
  it is the same server change an offline queue would need later.

## Open questions for the map owner

- Is a lost entry acceptable for a first release if the person is told immediately and the form
  keeps its values?
- If offline queuing is wanted, is it Baby-only or a Shell capability every App can opt into?
- Should entries record the time of the event separately from the time they reached the server,
  so a late sync still sorts correctly? (Useful regardless of offline support.)

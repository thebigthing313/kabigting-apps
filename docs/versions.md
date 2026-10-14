# Versions and verification

Exact pins and the results of the scaffold-time checks (spec section 13). Dates are when the
pin was resolved or the check was run.

## Pins resolved at scaffold

| Package                 | Version                                            | Resolved   |
| ----------------------- | -------------------------------------------------- | ---------- |
| prettier                | 3.9.10                                             | 2026-10-14 |
| husky                   | 9.1.7                                              | 2026-10-14 |
| lint-staged             | 17.6.0                                             | 2026-10-14 |
| @types/node             | 24.19.2 (matches the Node 24 runtime)              | 2026-10-14 |
| @changesets/cli         | 3.0.3 (added at the user's request during phase 1) | 2026-10-14 |
| postgres (Docker image) | 18.6                                               | 2026-10-14 |

## Verification results

| Check                                                                                                | Result                                                                                                                                                                                                                                           | Date       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `oxlint-tsgolint` 7.0.2004 runs against TypeScript 7.0.2 (`options.typeAware`)                       | Pass: `typescript/no-floating-promises` reports a deliberate floating promise                                                                                                                                                                    | 2026-10-14 |
| React Compiler lint rules fire                                                                       | Pass: `react/purity` reports `Math.random()` during render                                                                                                                                                                                       | 2026-10-14 |
| Boundary 1: client must not import server; `api.ts` type-only exception                              | Pass: value import fails in `src/client` and `src/client/data`; `import type` in `src/client/data/api.ts` passes                                                                                                                                 | 2026-10-14 |
| Boundary 2: server must not import client                                                            | Pass: relative and `@/` imports fail                                                                                                                                                                                                             | 2026-10-14 |
| Boundary 3: shared must not import client, server, hono, pg, drizzle-orm, better-auth                | Pass: each fails                                                                                                                                                                                                                                 | 2026-10-14 |
| Boundary 4: TanStack DB only in `src/client/data/`                                                   | Pass: fails in `src/client`, passes in `src/client/data`                                                                                                                                                                                         | 2026-10-14 |
| Boundary 5: no cross-App imports                                                                     | Pass with a temporary second App key: relative and `@/apps/<b>` imports fail                                                                                                                                                                     | 2026-10-14 |
| Boundary 6: date-fns only in `src/shared/dates.ts`                                                   | Pass: fails in `src/server`, passes in `dates.ts`                                                                                                                                                                                                | 2026-10-14 |
| Rule 7: `new Date(<string>)` grep check                                                              | Pass: flags `new Date("2026-01-01")`, allows `new Date(0)` and `new Date()`                                                                                                                                                                      | 2026-10-14 |
| `tsc --noEmit` on the phase 1 configs with TypeScript 7.0.2                                          | Pass (no `baseUrl`, no `incremental`)                                                                                                                                                                                                            | 2026-10-14 |
| Node type stripping with Drizzle and Better Auth                                                     | Pass: `node src/server/db/migrate.ts` applies migrations and `createAuth` answers `getSession`, no `tsx` needed                                                                                                                                  | 2026-10-14 |
| Postgres 18 Docker volume layout                                                                     | Pass: `PGDATA` is `/var/lib/postgresql/18/docker`; the volume mounts at `/var/lib/postgresql`                                                                                                                                                    | 2026-10-14 |
| Postgres 18 native `uuidv7()` column default                                                         | Pass (integration test)                                                                                                                                                                                                                          | 2026-10-14 |
| Migrations apply from an empty database and re-run as a no-op                                        | Pass (integration test)                                                                                                                                                                                                                          | 2026-10-14 |
| `tsc` as the `erasableSyntaxOnly` gate                                                               | Pass on shared and server code                                                                                                                                                                                                                   | 2026-10-14 |
| Unit tests under `TZ=Pacific/Auckland`                                                               | Pass: a guard test asserts the zone                                                                                                                                                                                                              | 2026-10-14 |
| `createUser` and `mustChangePassword` (`input: false`)                                               | Server-side `createUser` honours `data.mustChangePassword: true` (needed by the admin scripts). A client cannot set or clear it: `update-user` rejects the field with 400, and a flagged Account gets 403 from `update-user` (integration tests) | 2026-10-14 |
| Hono SPA fallback and cache headers                                                                  | Pass: deep links serve `index.html` with `no-cache`; `sw.js` and the manifest `no-cache`; `/assets/*` immutable; a missing asset is 404; `/api/*` is `no-store` with `X-App-Version`                                                             | 2026-10-14 |
| Server boots under Node type stripping                                                               | Pass: `node src/server/index.ts` serves `/api/health`                                                                                                                                                                                            | 2026-10-14 |
| Cookie `sameSite` and `Secure` behind Railway's proxy                                                | Deferred to phase 8 (needs the deployed domain). Locally the cookie is `HttpOnly; SameSite=Lax`                                                                                                                                                  | 2026-10-14 |
| `shadcn init` with `paths` only in the root tsconfig (no `baseUrl`), aliases into `src/client`       | Pass: `components.json` has `baseColor: "olive"`, style `base-nova`, aliases `@/components`, `@/lib`, `@/hooks`                                                                                                                                  | 2026-10-14 |
| Olive base colour at `init`                                                                          | Pass, with preset code `b6rtDj4PQ` (nova, Base UI, Inter, lucide). The registry requires the theme and chart colour to match an Olive base, so both are Olive                                                                                    | 2026-10-14 |
| TanStack Router `Register` augmentation in plain SPA mode                                            | Pass without `@tanstack/router-core`: a `Link` to an unknown path is a type error                                                                                                                                                                | 2026-10-14 |
| `tsc --noEmit` on client + server with TS 7.0.2, including the Hono typed client importing `AppType` | Pass                                                                                                                                                                                                                                             | 2026-10-14 |
| Sign-in in `pnpm dev` (one origin, `/api` proxied)                                                   | Pass: temporary-password sign-in, 403 until changed, change, Shell and App launcher, deep-link redirect after sign-in; light phone and dark desktop screenshots with no console errors                                                           | 2026-10-14 |
| A `useLiveQuery` component under React Compiler and TS 7                                             | Pass: `NotesPage` is compiled (component test) and the TanStack DB types check under `tsc`                                                                                                                                                       | 2026-10-14 |
| React Compiler check can fail                                                                        | Pass: a `"use no memo"` control is reported as not compiled                                                                                                                                                                                      | 2026-10-14 |
| TanStack Form with Zod 4 (Standard Schema)                                                           | Pass in Chromium and WebKit; no Zod 3 fallback needed                                                                                                                                                                                            | 2026-10-14 |
| shadcn calendar                                                                                      | Pass: renders and selects a day in Chromium and WebKit. `calendar.tsx` needs `react/no-unstable-nested-components` relaxed (generated code)                                                                                                      | 2026-10-14 |
| Optimistic writes and rollback in `pnpm dev`                                                         | Pass: create, edit, delete; a forced 500 on create rolls the row back with a "Saving failed" toast; sign-out returns to sign-in with no console errors                                                                                           | 2026-10-14 |
| One real `vite build` with vite-plugin-pwa 2.0.0 on Vite 8.3.4                                       | Pass: `generateSW`, one navigation route with `denylist: [/^\/api\//]`, no runtime routes, precache holds only shell files (no `/api`, no source maps, no `version.json`)                                                                        | 2026-10-14 |
| Chromium service-worker tests (Playwright on the production build)                                   | Pass: manifest fields and icons, registration and control, the shell opening offline with "You're offline", a changed `sw.js` raising "Update available" and Reload switching to it                                                              | 2026-10-14 |
| Real-device checks of `theme-color` (WebKit bug 305546) and iOS update timing                        | Deferred to phase 8 (needs the deployed domain and real phones)                                                                                                                                                                                  | 2026-10-14 |

## Notes

- Better Auth generates its tables with `timestamp` (no time zone). The generated schema is never
  hand-edited, so App tables use `timestamptz` and the auth tables keep Better Auth's choice. The
  server runs in UTC on Railway.
- The admin plugin's `setUserPassword`, `banUser` and `revokeUserSessions` require an admin
  session even when called on the server (only `createUser` does not). The admin scripts therefore
  reset and ban through Better Auth's internal adapter (`updatePassword`, `updateUser`,
  `deleteUserSessions`), using Better Auth's own password hashing.
- `admin:create` uses the same code path as `admin:create-account` (role `admin`, every App, a
  one-time temporary password with the forced change), the spec's fallback to the Better Auth
  server API instead of `npx auth create-admin`. The CLI reads a static config file and would skip
  the forced change.
- Rate limiting is on in `createAuth`; the test-only auth instance turns it off so tests can sign
  in repeatedly. An integration test checks the production config returns 429.
- `shadcn add sonner` generated a toaster that imports `next-themes`; it uses our theme provider
  instead and `next-themes` is not installed. `shadcn` generated `use-mobile.ts` with `setState`
  inside an effect, which the React Compiler rules reject; it is rewritten with
  `useSyncExternalStore`. `components/ui/**` relaxes `no-shadow` and
  `no-unsafe-type-assertion` (generated CSS-variable style objects).
- pnpm 11 recorded `minimumReleaseAgeExclude` entries in `pnpm-workspace.yaml` for pinned versions
  published within its minimum release age; they are the exact pins above.
- TanStack DB 0.14 deprecates `transaction.isPersisted.promise` (removed at 1.0 RC); the data
  module uses `transaction.when("settled")`. Mutation handlers still return `{ refetch: false }`
  after `writeUpsert`/`writeDelete` to opt out of the pre-1.0 automatic refetch.
- Sign-out first navigates off the current page, then clears the query cache and cleans up every
  collection, then does a full navigation. Cleaning up while a live query is mounted logs a
  TanStack DB error.
- Icons: `pnpm icons:generate` reads `pwa-assets.config.ts`, which is the `minimal-2023` preset
  with the maskable and Apple icons filled with Olive 600 instead of the preset's white padding
  (the "K" already sits inside the maskable safe zone).
- Vite's `envDir` is `false`: `.env` holds the server's settings, and its `NODE_ENV=development`
  made `vite build` bundle React's development build (`jsxDEV`, a 631 KB main chunk). The client
  reads no env files; the build ID is injected with `define`.
- Update flow: Reload also reloads directly when no service worker controls the page (a deploy
  during someone's first visit), because no "controlling" event will come. A failed session
  check offline throws a network error instead of reading as "signed out".

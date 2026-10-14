# Walking skeleton scaffold spec

The output of the `environment-setup` map. A build agent executes this in one pass to produce the **Walking skeleton**: sign in, forced first password change, the Shell, a `skeleton_notes` round trip through the client cache, an installable PWA, deployed on Railway's generated domain.

Read first: `CONTEXT.md` (glossary), then this file. Every decision below is final and traces to a ticket in `.scratch/environment-setup/issues/` (cited as `#NN`). Research detail lives on the `research/*` branches. If something here cannot be done as written, stop, record the deviation and ask the user. Do not silently re-decide.

## 0. Ground rules

- Online-first. Single package. One Railway service: Hono serves `/api/*` and the built SPA from one origin, with Railway Postgres 18 beside it (#03, #05).
- The repo will be **public** (#13). Never commit secrets, real data, the Access database or exports, or any personal name, email or local path. Re-scan files and history for these before the first push.
- Versions are exact pins (no `^`). Where this file gives a version it comes from research on 2026-10-14. Where it says "resolve at scaffold", install the current release, run the verification below, then pin and record the version in `docs/versions.md`.
- Planning conventions: Prettier style is 2-space, double quotes, no semicolons, trailing commas, width 100, LF (#06). If shadcn's generated files use semicolons, flip the semicolon setting rather than reformat them.

## 1. Acceptance criteria (the skeleton is done when all hold)

1. `pnpm dev` starts Vite (5173) and Hono (3000); the browser sees one origin; `/api` is proxied.
2. `pnpm check` passes: Oxlint (zero warnings, typed rules, React Compiler rules, boundary rules), Prettier check, `tsc --noEmit`, and the `new Date(` grep check.
3. `pnpm test:all` passes (unit, integration against Postgres 18, browser-mode component tests, Playwright e2e on the production build).
4. An Admin can be created by script; an Account can be created by script with a one-time temporary password; that Account cannot call any API except get-session, change-password and sign-out until it changes its password.
5. After changing the password, the Account (granted the `skeleton` App through `app_access`) can create, edit and delete `skeleton_notes` in the browser, optimistically, with rollback on failure.
6. An Account without `app_access` for `skeleton` gets 403 `forbidden_app`.
7. Sign-out clears every collection and the query cache and does a full navigation.
8. The production build installs as a PWA, shows the update toast when a new build is deployed, and shows an offline screen when offline.
9. A push to `main` runs CI and, once green, Railway deploys; the pre-deploy step applies migrations; `/api/health` is green; the generated domain serves the app.
10. Olive base colour, light/dark/system theme without a flash, mobile-first layout that also works at desktop widths.

## 2. Version pins

From research (#01, #02, #04, #19, #20, #21). Install exactly these.

| Area | Package | Version |
| --- | --- | --- |
| Language | typescript | 7.0.2 |
| Build | vite | 8.3.4 |
| | @vitejs/plugin-react | 6.1.2 |
| | @rolldown/plugin-babel | 0.2.4 |
| | babel-plugin-react-compiler | 1.0.0 |
| Routing | @tanstack/react-router | 1.170.44 |
| | @tanstack/router-plugin | 1.168.46 |
| Client data | @tanstack/db | 0.14.0 |
| | @tanstack/react-db | 0.5.9 |
| | @tanstack/query-db-collection | 1.4.4 |
| | @tanstack/react-query | resolve at scaffold (the peer of query-db-collection) |
| Forms/tables | @tanstack/react-form, @tanstack/react-table | resolve at scaffold |
| API | hono | 4.13.13 |
| | @hono/node-server, @hono/zod-validator | resolve at scaffold |
| Auth | better-auth | 1.7.7 |
| | @better-auth/drizzle-adapter | resolve at scaffold (needs drizzle-orm ^0.45.2) |
| DB | drizzle-orm | 0.45.4 |
| | drizzle-kit | resolve at scaffold (matching 0.45.x) |
| | pg, @types/pg | resolve at scaffold |
| Validation | zod | resolve 4.x at scaffold |
| Dates | date-fns / @date-fns/tz | 4.4.0 / 1.5.0 |
| IDs | uuid | resolve at scaffold (v7) |
| UI | tailwindcss, @tailwindcss/vite | 4.3.3 |
| | shadcn (CLI) | 4.21.5 |
| | sonner, lucide-react, @fontsource-variable/inter | resolve at scaffold |
| PWA | vite-plugin-pwa | 2.0.0 |
| | @vite-pwa/assets-generator | 2.0.0 |
| Lint/format | oxlint | 1.88.0 |
| | oxlint-tsgolint | 7.0.2004 |
| | prettier, prettier-plugin-tailwindcss | resolve / 0.8.1 |
| | husky, lint-staged | resolve at scaffold |
| Test | vitest | 5.0.4 |
| | @vitest/browser-playwright, vitest-browser-react, happy-dom | resolve at scaffold (match vitest 5.0.4) |
| | @playwright/test, fast-check | resolve at scaffold |
| Tooling | concurrently, @railway/cli (dev dependency) | resolve at scaffold |

Runtime: Node 24 (`engines.node ">=24"`, `.nvmrc` = `24`), pnpm via the `packageManager` field (#05). Postgres 18 (#05).

## 3. Repository layout (#05)

```
.editorconfig  .gitattributes  .gitignore  .nvmrc  .env.example
AGENTS.md  CONTEXT.md  README.md  compose.yaml
package.json  pnpm-lock.yaml
tsconfig.json  tsconfig.client.json  tsconfig.server.json
vite.config.ts  vitest.config.ts  playwright.config.ts
oxlint.config.ts  prettier.config.js  drizzle.config.ts
pwa-assets.config.ts  components.json
.github/workflows/ci.yml  .github/dependabot.yml
.railway/railway.ts
.husky/pre-commit  .husky/pre-push
docs/versions.md  docs/restore.md
public/logo.svg            (source "K" on Olive; generated icons land in public/)
index.html
scripts/                   (admin:create, admin:reset, check-no-date-string.mjs, icons)
e2e/
src/
  client/
    main.tsx  styles.css  routeTree.gen.ts (generated, ignored by lint/format)
    routes/                (TanStack Router file routes)
    shell/                 (layout, sidebar, app switcher, theme, install menu, update toast)
    apps/skeleton/         (notes page, notes table, notes form)
    components/            (app-level compounds, e.g. amount-input)
    components/ui/         (shadcn output)
    data/                  (ONLY place TanStack DB is imported: api.ts, query-client.ts,
                            collection-factory.ts, skeleton-notes.ts, session.ts, error-handler.ts)
    theme/storage-key.ts
  server/
    index.ts  app.ts  env.ts
    core/                  (create-app-router.ts, errors.ts, middleware: body-limit, session,
                            must-change-password, require-app, cache-headers)
    auth/                  (auth.ts)
    db/                    (client.ts, migrate.ts, schema/{auth.ts,access.ts,skeleton.ts,index.ts}, migrations/)
    apps/skeleton/routes.ts
    static.ts
  shared/
    schemas/{primitives.ts,skeleton.ts,query.ts}
    api-error.ts  money.ts  dates.ts  ids.ts
```

## 4. Configuration

### 4.1 TypeScript (#05, #01)

- `tsconfig.json`: `files: []`, `references` to client and server configs. **Put `paths` in the root `tsconfig.json` as well** (shadcn `init` fails to load the workspace config otherwise; bug #11466). **Never set `baseUrl`** (hard error in TS 7).
- `tsconfig.client.json`: DOM libs, `types: ["vite/client"]`, `paths`: `@/*` → `src/client/*`, `@shared/*` → `src/shared/*`; include `src/client`, `src/shared`.
- `tsconfig.server.json`: `types: ["node"]`, `module/moduleResolution: nodenext`, `erasableSyntaxOnly`, `allowImportingTsExtensions`, `noEmit`; include `src/server`, `src/shared`, `scripts`.
- Both: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. **No `incremental`** in `typecheck` (false TS2589 after incremental rebuilds on 7.0.2).
- Code run by Node directly (everything under `src/server`, `src/shared`, `scripts`): relative imports with `.ts` extensions inside `src/shared`; `#server/*` and `#shared/*` through `package.json` `imports` elsewhere on the server; no enums, namespaces or parameter properties. The client may use the `@` aliases.
- `package.json`: `"type": "module"`, `"imports": { "#server/*": "./src/server/*", "#shared/*": "./src/shared/*" }`.

### 4.2 Scripts

`dev` (concurrently: `dev:client` = `vite`, `dev:server` = `node --env-file=.env --watch src/server/index.ts`), `build` = `vite build`, `start` = `node src/server/index.ts`, `check` = lint + format:check + typecheck + `node scripts/check-no-date-string.mjs`, `lint` = `oxlint --deny-warnings`, `format`, `format:check`, `typecheck` = `tsc --noEmit -p tsconfig.client.json && tsc --noEmit -p tsconfig.server.json`, `test:unit`, `test:int`, `test:component`, `test:e2e`, `test:all`, `db:generate`, `db:migrate`, `db:studio`, `auth:generate` (`npx auth@latest generate`), `admin:create`, `admin:reset`, `icons:generate` (`pwa-assets-generator --preset minimal-2023`).

### 4.3 Vite (#01, #19, #21)

Plugins in order: TanStack Router plugin, `@vitejs/plugin-react`, `@rolldown/plugin-babel` with `reactCompilerPreset()`, `@tailwindcss/vite`, `vite-plugin-pwa`, and a small `transformIndexHtml` plugin that injects the theme script using the constant from `src/client/theme/storage-key.ts`. Dev server proxies `/api` to `http://localhost:3000`. Build output `dist/client`. Service worker disabled in dev (`devOptions.enabled: false`).

### 4.4 Lint and format (#06, #18)

- `oxlint.config.ts`: `react` plugin plus `correctness` category (brings the React Compiler rules), typed rules through `oxlint-tsgolint`, `any`, floating promises and unused code as errors, `no-console` error in `src/client` only, zero warnings. Ignore `routeTree.gen.ts`, `src/server/db/schema/auth.ts`, `src/server/db/migrations`, `dist`. Relax a short list of rules in `src/client/components/ui/**`.
- Boundary rules via `no-restricted-imports`, each scoped by `overrides[].files`. Overrides do not merge options, so spread a shared base: (1) `src/client` must not import `src/server`, except `src/client/data/api.ts` with `allowTypeImports: true`; (2) `src/server` must not import `src/client`; (3) `src/shared` must not import client, server, `hono`, `pg`, `drizzle-orm`, `better-auth`; (4) `@tanstack/db`, `@tanstack/react-db`, `@tanstack/query-db-collection` only inside `src/client/data/`; (5) no cross-App imports (`src/*/apps/<a>` must not import `src/*/apps/<b>`); (6) `date-fns` and `@date-fns/tz` only inside `src/shared/dates.ts`.
- Rule 7 (no `new Date(<string>)`) is the grep check `scripts/check-no-date-string.mjs`, scanning `src/` for `new Date(` with a non-numeric, non-empty argument, excluding `src/shared/dates.ts`.
- Prettier pinned, `prettier-plugin-tailwindcss` last in `plugins` with `tailwindStylesheet` and `tailwindFunctions`. Husky pre-commit runs lint-staged (Prettier write, Oxlint fix, re-stage); pre-push runs `pnpm check` and `test:unit`. Never `--no-verify`.

### 4.5 Local services and env (#05, #13)

- `compose.yaml`: Postgres 18 with a named volume (note the Postgres 18 data directory layout change, check the image docs), database `kabigting`; the test projects create their own databases.
- `.env.example` (committed): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BASE_URL`, `PORT`, `NODE_ENV`. Real `.env` is ignored. `src/server/env.ts` parses with Zod at start and refuses to boot on missing or malformed values.

## 5. Database (#09, #11)

- Drizzle `0.45.4` on `pg` `Pool`; `casing: 'snake_case'`; committed SQL migrations; forward-only; `push` is never used.
- `schema/auth.ts` is **generated** by `npx auth@latest generate` with `modelName` prefixes giving `auth_user`, `auth_session`, `auth_account`, `auth_verification`, plus the admin plugin columns and the `mustChangePassword` additional field. Committed, never hand-edited; regenerate when plugins change.
- `schema/access.ts`: `app_access(user_id text references auth_user.id, app_key text, created_at timestamptz default now(), primary key (user_id, app_key))`.
- `schema/skeleton.ts`: `skeleton_notes(id uuid primary key default uuidv7(), user_id text not null references auth_user.id, text text not null, amount_cents bigint not null (mode number), on_date date not null (mode string), created_at/updated_at timestamptz default now())`. Disposable: deleted when the finances port begins.
- `db/migrate.ts` uses `drizzle-orm`'s `migrate()` against `src/server/db/migrations`; it is the Railway pre-deploy command and must not import `drizzle-kit`.

## 6. Shared code (#10, #11, #16)

- `schemas/primitives.ts`: `cents` (safe integer), `isoDate` (`YYYY-MM-DD`), `instant` (ISO-8601 UTC), `id` (UUID). All input schemas `.strict()`.
- `schemas/query.ts`: base query body `{ ids?: id[] (max 5000), limit?, after? }`; per-resource filters extend it. Responses are `{ rows: [...] }`.
- `api-error.ts`: `ApiErrorCode` = `unauthenticated | password_change_required | forbidden_app | validation_failed | not_found | conflict | internal`, plus envelope type `{ error: { code, message, details? } }`.
- `money.ts`: USD constant, integer cents only, half-up rounding, `allocate()` that never loses cents, strict `parse()` (reject more than two decimals, accept typed decimals such as `1,250.50`), `format()` through `Intl.NumberFormat('en-US')`. Amounts are **signed**: outflow negative.
- `dates.ts`: the only importer of `date-fns` and `@date-fns/tz`; household zone `America/New_York` as a constant; `YYYY-MM-DD` kept as strings; month ranges as half-open intervals in the household zone; never `new Date('YYYY-MM-DD')`.
- `ids.ts`: UUIDv7 via `uuid`.

## 7. Server (#04, #10, #15, #21)

- `app.ts` builds the Hono app and exports `type AppType`; `index.ts` serves it with `@hono/node-server`. `static.ts` serves `dist/client`, then falls back to `index.html` for non-`/api` paths (Hono's `serveStatic` sets no cache headers, set them yourself).
- Cache headers: `Cache-Control: no-cache` on `index.html`, `sw.js`, the manifest; `immutable` on `/assets/*`; `no-store` on every `/api/*` response; add `X-App-Version` (build ID) to responses.
- `auth/auth.ts` (Better Auth 1.7.7): Drizzle adapter, `emailAndPassword { enabled: true, disableSignUp: true, minPasswordLength: 12 }` with no `sendResetPassword` (self-service reset disabled by design), the admin plugin (roles `admin`, `user` only), `mustChangePassword` additional field (`input: false`), sessions 30 days refreshed on use, `cookieCache` **off**, rate limiting on, explicit `baseURL` and `BETTER_AUTH_SECRET`. Mount `auth.handler` at `/api/auth/*`. No CORS (same origin).
- Forced change: a global `/api/*` middleware returns 403 `password_change_required` for any request except `GET /api/auth/get-session`, change-password and sign-out while `mustChangePassword` is true. A before-hook rejects a new password equal to the temporary one. An after-hook on `/change-password` clears the flag and revokes the other sessions.
- `core/create-app-router.ts`: `createAppRouter(appKey)` is the only way to create an App router. Fixed order: body limit (a few hundred KB), session required, must-change-password guard, `requireApp(appKey)` (checks `app_access`, else 403 `forbidden_app`), then each route's own `@hono/zod-validator`. Context carries a typed `account`. One router per App, composed with `.route('/<app>', ...)`.
- `apps/skeleton/routes.ts`: `POST /api/skeleton/notes/query`, `POST /api/skeleton/notes`, `PATCH /api/skeleton/notes/:id`, `DELETE /api/skeleton/notes/:id`; every write returns the full row; the client supplies the UUID, the server validates it, a duplicate returns 409 `conflict`; rows are scoped to the signed-in Account.
- `core/errors.ts`: one `app.onError` maps thrown errors to the envelope.
- `GET /api/health`: 200 only when the database answers; Railway's healthcheck points here.
- Scripts: `admin:create` seeds the first Admin (`npx auth@latest create-admin` per research; fall back to a script using the Better Auth server API if that does not fit); `admin:create-account` creates an Account with a generated random temporary password shown once, `mustChangePassword = true`, and grants `app_access` for named Apps; `admin:reset` sets a new temporary password, sets the flag again and revokes sessions. Removal is ban plus revoke sessions.

## 8. Client (#08, #12, #16)

- Routes: `/sign-in`, `/change-password`, an authenticated layout (`beforeLoad` redirects to sign-in if no session, to change-password if the flag is set), `/` (App launcher), `/skeleton` (notes), a not-found page and an error page.
- `data/`: the only importer of TanStack DB. `query-client.ts` with refetch on window focus and reconnect, no polling. `collection-factory.ts`: eager Query Collection, optimistic by default, handlers call the typed Hono client, return the written row and `writeUpsert` (or `{ refetch: false }`), roll back by throwing, toast on failure. `api.ts` is the **single** client file allowed `import type` from the server route types. `error-handler.ts`: 401 → sign-in; 403 `password_change_required` → change-password; an `X-App-Version` newer than the running build raises the update toast. `session.ts`: sign-out clears the query cache, cleans up every collection and does a full navigation. Collections for an App are created only after sign-in and a passing `app_access` check.
- `apps/skeleton`: TanStack Form (Zod 4) for create and edit; TanStack Table for the list; `components/amount-input.tsx` built from shadcn Input plus the `money` parser (typed decimals, converts to cents on blur). Red/green amounts always paired with an explicit sign.
- Shell: shadcn Sidebar (collapsible desktop, drawer on mobile) with an App switcher; theme toggle (light/dark/system); "Install app" item (Chrome/Edge trigger the prompt, iOS shows a how-to dialog for Share → Add to Home Screen, hidden once installed); sign-out. Mobile-first, touch targets at least 44px, safe-area insets honoured, with real desktop layouts for the notes table.
- Styling: Tailwind v4; `shadcn init` with **Olive** base colour (cannot be changed afterwards), Base UI primitives, default `nova` preset; self-hosted Inter variable. Light/dark/system with the pre-paint inline script in `<head>` sharing one storage-key constant (`vite-ui-theme`) with the provider.
- PWA: `vite-plugin-pwa` `generateSW`, `registerType: 'prompt'`, no `runtimeCaching`, `navigateFallbackDenylist: [/^\/api\//]`. Manifest: name "Kabigting Apps", short name "Kabigting", `display: standalone`, `start_url`, `scope` and `id` all `/`, orientation unlocked, Olive-derived colours for light and dark, two `theme-color` meta tags with `prefers-color-scheme`. Icons from `public/logo.svg` (a simple "K" on Olive) via `@vite-pwa/assets-generator` with `--preset minimal-2023`. Update toast: "Update available — Reload", checks on launch, on returning to the foreground and about hourly; use `onNeedReload` to save in-progress drafts before reloading. Offline: the shell opens and shows a clear "You're offline" screen.

## 9. Tests (#07)

- Vitest 5.0.4 as named projects `unit`, `integration`, `component` (happy-dom) and a browser project (Chromium and WebKit) for the amount input and notes form.
- Unit: `money` (including `fast-check` properties: allocations sum exactly; rounding for negatives), `dates` (fake timers, DST cases 2026-03-08 and 2026-11-01 in New York, month-boundary instants near midnight), `ids`, schema primitives. Run under `TZ=Pacific/Auckland`.
- Integration: Hono app in process against real Postgres 18; per-worker database named from `VITEST_POOL_ID`, cloned from a migrated template built in `globalSetup` (close every connection to the template before cloning); no mocks; Better Auth `testUtils()` for sign-in. Cover 401, `password_change_required`, `forbidden_app`, notes create/update/delete/query, the admin scripts, and migrations applying from an empty database.
- Component: a test that fails if a skeleton component was not compiled by React Compiler.
- E2E (Playwright on `vite build` plus `node src/server/index.ts` on a test database): setup project signs in once and saves storage state; sign in, forced change, notes CRUD, sign-out leaves no data behind. Projects: Chromium and WebKit, phone and desktop viewports. Service-worker registration and update-toast tests run in Chromium only. Manifest and installability checks.
- No coverage gate, no UI snapshots.

## 10. CI/CD and Railway (#13, #03, #14)

- `.github/workflows/ci.yml` (Node 24, pnpm cached store): job 1 `pnpm check`; job 2 unit and integration with a Postgres 18 service container; job 3 production build then Playwright (cached browsers). CI holds **no production secrets**; tests use an ephemeral database and a throwaway auth secret. `main` is protected with CI required. `.github/dependabot.yml`: security updates only. `pnpm audit --prod` runs as information only.
- `.railway/railway.ts` (Infrastructure as Code; `railway.json` is deprecated and stops being read 2026-12-01): service build (`pnpm build`), start (`node src/server/index.ts`), pre-deploy `node src/server/db/migrate.ts`, healthcheck `/api/health`, variables as references (`DATABASE_URL` from the Postgres service, sealed `BETTER_AUTH_SECRET`, `BASE_URL`, `RAILPACK_NO_SPA=1`), and a Postgres 18 service. Use no literal secret values. Check the exact syntax against the current Railway IaC reference before writing. Applied **by hand** with `railway config apply` from the user's machine; no Railway token in GitHub. The generated domain is set in the dashboard.
- Rollback: Railway's one-click rollback only suits additive migrations; destructive changes ship in a later migration than the code that stops using the old column.
- Backups: Railway's volume backups only (#14). Confirm the schedules are enabled on the Postgres volume, take a manual backup before risky migrations, and rehearse one restore once real data exists (`docs/restore.md`).

## 11. Build order (checkpoint after each phase; commit after each)

0. **Housekeeping** (user-assisted, section 12): git author scrub, then repo setup.
1. **Foundations:** `package.json`, pnpm, Node pin, TS configs, lint/format/hooks, `.editorconfig`, `.gitattributes`, `compose.yaml`, `AGENTS.md`, `README.md`. Checkpoint: `pnpm check` passes on an empty `src`.
2. **Shared + DB:** `money`, `dates`, `ids`, schemas, error codes, Drizzle schema, generated auth schema, first migration. Checkpoint: unit and migration tests pass.
3. **Server:** env, auth, middleware chain, `createAppRouter`, skeleton routes, health, static serving and headers, admin scripts. Checkpoint: integration tests pass.
4. **Client shell:** Vite, Router, Tailwind, shadcn (`init` with Olive), theme script, Shell, sign-in and change-password. Checkpoint: sign-in works in `pnpm dev`.
5. **Data + notes:** TanStack DB module, notes page (Form, Table, amount input), global error handling, sign-out clearing. Checkpoint: component tests and the Compiler check pass.
6. **PWA:** plugin, icons, manifest, install menu, update toast, offline screen. Checkpoint: build installs; Chromium service-worker test passes.
7. **E2E + CI:** Playwright projects, workflow. Checkpoint: `pnpm test:all` and CI green.
8. **Deploy:** Railway project, IaC applied, variables, domain, first Admin, real-device checks. Checkpoint: all acceptance criteria.

## 12. Manual steps only the user can do

1. **Git identity (before the first push):** choose the GitHub noreply address (`<id>+<username>@users.noreply.github.com`); rewrite the author on the existing local commits (two commits use the user's real email) and on any `research/*` or `worktree-*` branch to be pushed, or do not push those branches. Then re-scan files and history for personal names, emails and local paths.
2. **GitHub:** create the **public** repository `kabigting-apps`; add a licence if wanted; enable branch protection on `main` (CI required), Dependabot security updates, and Railway's "wait for GitHub checks".
3. **Railway:** create the project, add the Postgres 18 service, connect the GitHub repo, install the Railway CLI (the dev dependency) and run `railway config apply`, generate the domain, set the sealed `BETTER_AUTH_SECRET` and `BASE_URL`, and enable backup schedules.
4. **Node:** upgrade local Node from 22.17.1 to 24.
5. **After deploy:** run `admin:create`, create the family Accounts and share their temporary passwords out of band, and install the PWA on a real iPhone and Android to check the status bar colour, install flow and update flow.

## 13. Verification deferred from tickets (do these, record results in `docs/versions.md`)

- `tsc --noEmit` passes on the pinned set under TS 7.0.2; `shadcn init` works with `paths` only in the root tsconfig; the TanStack Router `Register` augmentation works in plain SPA mode (it may need `@tanstack/router-core`).
- Node type stripping works with Drizzle and Better Auth (fallback: `tsx`); Railpack honours pnpm via Corepack; Postgres 18 provisions on Railway; the pre-deploy command runs with the service variables.
- `oxlint-tsgolint` runs against TS 7.0.2; the React Compiler rules fire on a deliberate violation; each boundary rule fails on a deliberate violation while the `api.ts` type-only exception passes.
- A `useLiveQuery` component compiles under React Compiler and its types check under TS 7; `createUser` really does not let a client set `mustChangePassword` through `data` (research says it may not filter `input: false` fields; test it); cookie `sameSite` and `Secure` behind Railway's proxy; the Hono SPA fallback.
- A TanStack Form with Zod 4 works; the shadcn calendar renders (`calendar.tsx` is skipped by React Compiler, not broken; react-day-picker 10 removed some props).
- One real `vite build` with `vite-plugin-pwa` 2.0.0; real-device checks of `theme-color` (WebKit bug 305546) and iOS service-worker update timing.
- Vitest `--typecheck` (experimental) and `tsc` as the `erasableSyntaxOnly` gate; the Postgres 18 Docker volume layout.

## 14. Fallbacks (use only if the check above fails; then tell the user)

| If this fails | Fall back to |
| --- | --- |
| Node type stripping vs Drizzle or Better Auth | `tsx` for dev and start |
| TanStack Form with Zod 4 | Zod 3-style usage |
| Calendar breaks | a different date input |
| `railway.ts` lacks an option | set it in the Railway dashboard and record it |
| Olive base colour unavailable at `init` | stop and ask (it cannot be changed later) |

## 15. Out of scope

The finances app and its Access data migration, custom domain, offline writes, multi-household, off-platform backups, transactional email, an in-app admin screen, push notifications and background sync, store listings, 2FA/passkeys/breached-password checks, staging environment, observability (error tracking and uptime monitoring), charts. See the map's Out of scope section.

## 16. Decisions added during the build (by the user)

- **Changesets** manage versioning and the changelog (`pnpm changeset`, `pnpm version-packages`; private package, nothing published).
- CI **requires a changeset** for every merge to `main`.
- A release **versions automatically**: the Changesets GitHub Action opens a "Version Packages" pull request from pending changesets; merging it bumps the version and writes `CHANGELOG.md`.
- **No git author rewrite** (section 12.1 waived): the user's commit email is already public on their other repositories. The `research/*` and `worktree-*` branches stay local and are never pushed.

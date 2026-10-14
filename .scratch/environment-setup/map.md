# Map: kabigting-apps environment setup

## Destination

A locked set of stack decisions plus a scaffold spec a build agent can execute in one pass to produce the **Walking skeleton**, deployed as a PWA on Railway's generated domain. Nothing is left to decide before building. The finances app port is not part of this map.

## Notes

- Planning only: tickets resolve decisions; nothing is scaffolded until the map is done.
- Settled while charting (no ticket needed):
  - Must-haves: Postgres, React Compiler, TypeScript 7, TanStack Router, TanStack DB (client cache), Hono (API), Better Auth, Vite, shadcn.
  - Online-first. The PWA installs and caches the Shell; data is not queued offline. TanStack DB is a fast client cache that revalidates from the server.
  - One Railway service: Hono serves `/api/*` and the built SPA from the same origin, with Railway Postgres beside it. Vite dev proxies `/api`. (Proposed during charting, not contradicted.)
  - Single package with feature folders per App; no workspace until a second deployable exists. (Proposed, not contradicted.)
  - No household concept. The Admin provisions Accounts by email with a forced password change at first sign-in. Apps may later be shared with friends.
  - Railway-generated domain only; no custom domain.
- Stack gaps raised and accepted: ORM/migrations, validation + API typing, Tailwind, PWA tooling, lint/format, testing, money/dates, CI/CD + envs + secrets, backups, toolchain pinning.
- Skills: `grilling` + `domain-modeling` for grilling tickets; keep `CONTEXT.md` a glossary only.
- Standing rule (user): once commits reach the public GitHub repository, publish no personal info. Before the first push: set a GitHub noreply author address, rewrite the author fields of existing commits and of any `research/*` or `worktree-*` branch that gets pushed (or do not push those branches), and re-scan files and history for personal names, emails and paths. Never put personal info in tickets or docs.
- Tracker: local markdown in `.scratch/environment-setup/`.

## Decisions so far

<!-- one line per closed ticket: [title](issues/NN-slug.md): gist -->

- [Research: Railway single-service deploy](issues/03-railway-single-service.md): IaC (`.railway/railway.ts`), not `railway.json`; set `RAILPACK_NO_SPA=1`; pre-deploy migrations; healthcheck is deploy-time only; Hono must send no-cache for `sw.js`/`index.html`. Branch `research/railway-single-service`.
- [Research: Better Auth admin-provisioned accounts](issues/04-better-auth-admin.md): `disableSignUp` + admin `createUser`; forced password change must be hand-built (`mustChangePassword` flag + Hono guard); friend access via an app-owned `app_access` table. Branch `research/better-auth-admin`.
- [Research: TanStack DB for an online-first app](issues/02-tanstack-db-online-first.md): beta/pre-1.0, pin exact versions; use an eager Query Collection over Hono REST; defer Electric; React Compiler and TS 7 compatibility unverified, so smoke-test in the skeleton. Branch `research/tanstack-db-online-first`.
- [Research: TypeScript 7 ecosystem compatibility](issues/01-ts7-ecosystem-compat.md): TS 7.0.2 stable and nothing blocked; pinned set in the ticket (vite 8.3.4, React Compiler via `@rolldown/plugin-babel`); no `baseUrl`; typescript-eslint is capped below TS 6.1, oxlint targets TS 7; needs a real `tsc` smoke test. Branch `research/ts7-ecosystem-compat`.
- [Research: Date library choice](issues/17-date-library.md): recommends `date-fns` + `@date-fns/tz` behind one `dates` module (Safari lacks native Temporal); confirmed by the user. Branch `research/date-library`.
- [Grill: Auth provisioning model](issues/15-auth-provisioning-model.md): admin-created Accounts via script with a one-time temporary password and forced change; no email, so Admin-only resets; 30-day sessions; `admin`/`user` roles; default-deny `app_access` table in the skeleton, with Guests as app-limited Accounts; ban rather than delete.
- [Grill: Money and dates](issues/11-money-and-dates.md): USD only, integer cents (`bigint`), signed amounts (outflow negative), calendar `date` + UTC `timestamptz`, household timezone `America/New_York`, shared `money` helper with half-up rounding; dates via `date-fns` + `@date-fns/tz` behind one module.
- [Grill: Toolchain and repo layout](issues/05-toolchain-repo-layout.md): pnpm, Node 24; tier-first `src/{client,server,shared}`; server runs from `.ts` via Node type stripping; two-process dev with Vite proxy; Docker Compose Postgres 18; Hono serves the built SPA with no-cache on `sw.js`/`index.html`.
- [Grill: ORM and migrations](issues/09-orm-migrations.md): Drizzle 0.45.4 on `pg`; Better Auth tables prefixed `auth_`; `snake_case`, `amount_cents bigint`, `date` as strings; client-generated UUIDs (provisional on ticket 16); committed SQL migrations run by a programmatic pre-deploy script; forward-only.
- [Grill: TanStack DB role and collections](issues/16-tanstack-db-collections.md): eager Query Collections over Hono REST; reads are `POST .../query`, writes return the row; optimistic with rollback via one factory; UUIDv7 client IDs; focus/reconnect refetch, no persistence; sign-out clears collections; beta pinned and contained in `src/client/data/`; disposable `skeleton_notes` proves the path.
- [Grill: Validation and API typing](issues/10-validation-api-typing.md): Zod 4, hand-written shared schemas on shared primitives; type-only client import of route types via one file; one router per App; `{error:{code,message,details}}` envelope; `/query` with `ids` cap, `{rows}` response; strict inputs; `createAppRouter(appKey)` enforces the middleware chain.
- [Research: Lint and format tooling facts](issues/18-lint-format-tooling.md): Oxlint has native React Compiler rules and `no-restricted-imports` with `allowTypeImports`; Oxfmt is pre-1.0 with built-in Tailwind sorting; Biome cannot make the type-only exception; typescript-eslint cannot run on TS 7 until 7.1. Branch `research/lint-format-tooling`.
- [Grill: Lint and format](issues/06-lint-format.md): Oxlint + `oxlint-tsgolint` with native React Compiler rules; boundaries via `no-restricted-imports` (`allowTypeImports` for `api.ts`); `new Date(<string>)` is a grep check; pinned Prettier + Tailwind plugin; Husky + lint-staged autofix; zero warnings.
- [Grill: CI/CD, environments and secrets](issues/13-cicd-envs-secrets.md): public GitHub repo, Railway deploys from `main`; production only; Actions run check, unit, integration (Postgres 18) and Playwright; IaC applied by hand; no production secrets in CI; Dependabot security only; `/api/health`.
- [Grill: Tailwind and shadcn setup](issues/08-styling-shadcn.md): Tailwind v4; shadcn on Base UI, `nova` preset, **Olive base colour set at `init` (cannot change later)**; light/dark/system with pre-paint script; Sidebar shell; mobile-first with real desktop layouts; TanStack Form + TanStack Table; Prettier Tailwind plugin.
- [Research: Testing tooling facts](issues/20-testing-tooling-facts.md): Vitest 5.0.4 supports Vite 8 and works with TS 7 (`--typecheck` experimental); browser mode ran Chromium + WebKit; compiled components need an explicit check; service-worker Playwright APIs are Chromium-only; Better Auth has `testUtils()`; keep `tsc --noEmit` as the erasable-syntax gate. Branch `research/testing-tooling-facts`.
- [Research: PWA tooling facts](issues/21-pwa-tooling-facts.md): `vite-plugin-pwa` 2.0.0 supports Vite 8; `generateSW` + prompt; `@vite-pwa/assets-generator` for icons; Hono must set cache headers itself; iOS needs real-device checks. Branch `research/pwa-tooling-facts`.
- [Grill: Testing strategy](issues/07-testing-strategy.md): Vitest 5 in unit/integration/browser projects; happy-dom plus browser mode (Chromium, WebKit); real Postgres 18 with per-worker template databases; no mocking, Better Auth `testUtils()`; Playwright on the production build; `fast-check` for money; non-NY timezone; React Compiler check; `tsc` as the syntax gate.
- [Task: Write the Walking skeleton scaffold spec](issues/23-scaffold-spec.md): the build spec is [spec.md](spec.md); synthesises every decision above; nothing scaffolded.
- [Grill: PWA tooling and updates](issues/12-pwa-updates.md): shell-only precache, never `/api/*`; update toast with draft-saving reload and a version header; "K" icon on Olive; Install menu item (iOS how-to); push/sync/offline writes out of scope.
- [Grill: Backups](issues/14-backups.md): Railway volume backups only (default schedule); no off-platform copy or encryption; confirm schedules are enabled, manual backup before risky migrations, one restore rehearsal once real data exists.
- [Research: Tailwind and shadcn facts](issues/19-shadcn-tailwind-facts.md): Tailwind v4 works with Vite 8; shadcn `init` needs `paths` in the root tsconfig; Base UI is shadcn default (Radix via `-b radix`); inline head script avoids theme flash; shadcn has a TanStack Form guide (Zod 4 unverified); `calendar.tsx` compiles with a skip; Olive not checked. Branch `research/shadcn-tailwind-facts`.


## Not yet specified


## Out of scope

- Porting the finances app itself (starts after this map).
- Custom domain.
- Offline writes and conflict resolution (online-first was chosen).
- Multi-household / tenancy.
- Observability: error tracking, uptime monitoring and alerts (Railway logs only); decided by the user.
- Off-platform and encrypted backups, long retention beyond Railway's, automated backup monitoring (revisit if the data becomes hard to recreate).
- Push notifications, background/periodic sync, and Play Store / App Store listings (the PWA is installed from the browser).
- Transactional email (invites by link, self-service password reset); revisit only if the Admin-only reset becomes a burden.
- In-app admin screen for managing Accounts and App access (the skeleton uses a script).
- Hardening beyond the skeleton: 2FA, passkeys, breached-password check.
- Migrating the existing Access database (converting unsigned amount + type into signed amounts); part of the finances port.

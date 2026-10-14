# Grill: Testing strategy
Type: grilling
Status: resolved
Blocked by: 06

## Question

Decide unit/integration/E2E tooling (Vitest, Playwright), what the Walking skeleton must test, how tests get a Postgres, and where they run.

## Interim decisions (user-confirmed; ticket stays claimed until research 20 lands and the component-test environment is chosen)

- **Skeleton test scope:**
  1. Unit: `money` helper (rounding, split-without-losing-cents, parse, format), `dates` module, ID wrapper, shared Zod primitives.
  2. Server integration (Hono app in-process against real Postgres): middleware chain (401, `password_change_required` 403, `forbidden_app` 403); `skeleton_notes` create/update/delete/query; the admin script creating an Account; migrations applying cleanly from empty.
  3. Component: a handful, for the amount input and the notes form.
  4. End-to-end: sign in, forced password change, notes create/edit/delete, sign-out leaving no data behind.
  5. PWA checks: valid manifest and installability.
- **Test database:** the same Docker Compose Postgres 18 as development, with a separate test database. Each worker gets its own copy of a migrated template database (`CREATE DATABASE ... TEMPLATE`). CI supplies Postgres as a service container (ticket 13). Not Testcontainers, not PGlite.
- **No mocking** of Better Auth or the database. Integration tests create Accounts through the same helper as the admin script and sign in through the real endpoints. End-to-end tests sign in once in a setup step and reuse the saved browser session.
- **End-to-end:** runs against the production build (`vite build` then Hono serving it) on a test database. Playwright with Chromium and WebKit (the iPhone Safari engine), a phone viewport and a desktop viewport. Drop WebKit if nobody uses iOS.
- **Money and dates:** property-based tests (`fast-check`) for the `money` helper only (splits sum exactly; rounding is correct for negatives). Fake timers in date tests with explicit DST cases (2026-03-08, 2026-11-01 in New York) and month-boundary instants near midnight. Tests run under a timezone that is not New York (e.g. `TZ=Pacific/Auckland`) to flush out accidental local-time dependence.
- **Layout and gates:** unit tests colocated (`money.test.ts`); integration tests next to the server module (`routes.int.test.ts`); end-to-end tests in a top-level `e2e/` folder. Vitest runs as separate named projects (unit, integration). No coverage percentage gate; no UI snapshot tests. Pre-push runs `pnpm check` plus unit tests; integration and end-to-end run in CI and on demand via `pnpm test:all`.
- **Still open (needs research 20):** component-test environment (happy-dom/jsdom vs Vitest browser mode), Vitest compatibility with Vite 8 and TS 7, and running Node-type-stripped server code under Vitest.

## Answer

Decided with the user. The interim decisions above stand, plus the tooling from research 20:

- **Runner:** Vitest 5.0.4 (supports Vite 8.3.4 and Node 24), run as separate named projects. Pin exact versions; Vitest 5.0 has several browser-mode breaking changes.
- **Component tests:** happy-dom for the bulk, and Vitest browser mode (`@vitest/browser-playwright` and `vitest-browser-react`, Chromium and WebKit) for layout, touch and Safari-class checks. The skeleton's few component tests (amount input, notes form) run in browser mode, because input handling and mobile keyboards are what they exercise.
- **React Compiler check:** one test that fails if a skeleton component was not compiled. A green test alone proves nothing, because the compiler silently skips a component that mutates a module-level value during render, and it does not run under `@vitest-environment node`.
- **Type safety gate:** `tsc --noEmit` stays the gate for `erasableSyntaxOnly` violations (TS1294), because Vitest transforms `.ts` itself and ran an `enum` without complaint. `vitest --typecheck` (experimental) may be added for type tests; with TS 7 the tsconfig needs `types: ["node"]`.
- **Test database:** per-worker databases named from `VITEST_POOL_ID`, cloned from a template migrated in `globalSetup`. `CREATE DATABASE ... TEMPLATE` fails while any other session is connected to the template, so close every connection to it first.
- **Auth in tests:** Better Auth's `testUtils()` plugin (`login`, `getAuthHeaders`, `getCookies`) alongside the real endpoints; no mocking.
- **End-to-end:** Playwright on the production build. Service-worker APIs are Chromium-only, so the service-worker registration and update-toast test runs in Chromium only. WebKit covers layout and basic flows but is not real Safari. The manifest and installability checks are written from inference, since there is no official Playwright PWA guidance.
- **Not verified, check at scaffold time:** `--typecheck` in watch mode, `isMobile` per browser, Node 24 end to end, and the Postgres 18 Docker volume layout change.

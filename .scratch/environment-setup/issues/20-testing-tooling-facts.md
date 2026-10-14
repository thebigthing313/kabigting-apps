# Research: Testing tooling facts
Type: research
Status: resolved
Blocked by: none

## Question

Facts the testing strategy ticket waits on, as of 2026-10-14:
1. Current Vitest version, compatibility with Vite 8.3.4 and TypeScript 7.0.2, and how `vitest --typecheck` works under TS 7.
2. Vitest browser mode (real Chromium/WebKit via Playwright provider) vs happy-dom/jsdom for React 19 + React Compiler component tests: maturity and tradeoffs.
3. Testing React Compiler output: any known pitfalls with testing-library.
4. Playwright: testing an installed PWA/service worker (registration, update flow, manifest checks); WebKit support on Windows and Linux CI; mobile emulation.
5. Running server code under Node 24 type stripping in Vitest (does Vitest transform `.ts` itself; `#subpath` imports; `erasableSyntaxOnly`).
6. Test database patterns for Postgres 18: per-worker database from a template (`CREATE DATABASE ... TEMPLATE`), Testcontainers vs docker compose, and Better Auth testing guidance.

## Answer

Findings are on branch `research/testing-tooling-facts` (commit 061cfff), file `.scratch/environment-setup/research/20-testing-tooling-facts.md`. Claims are tagged PRIMARY, VERIFIED-LOCAL or INFERENCE. Local experiments ran in a scratch directory on Node 22.17.1, not 24. Agent output; not yet reviewed by the user.

- **Vitest 5.0.4** (2026-10-12) declares peers `vite ^6.4 || ^7 || ^8` and node `^22.12 || ^24 || >=26`, so Vite 8.3.4 is in range. `vitest --typecheck` spawns `tsc --noEmit --incremental` as a child process and works with TS 7.0.2 (no JS API until 7.1); still labelled experimental; with TS 7, `tsconfig` needs `types: ["node"]`.
- **Browser mode:** not labelled experimental in 5.x, but 5.0 has 7 browser-mode breaking changes, so pin versions. Chromium 156 and WebKit 27.2 passed on Windows 11 via `@vitest/browser-playwright` and `vitest-browser-react`. `toHaveTextContent` is now strict equality. Suggested split: happy-dom for bulk component tests, browser mode for layout, touch and Safari-class checks.
- **React Compiler under test:** no official guidance. The compiler runs under Vitest with happy-dom, not under `// @vitest-environment node`. It silently skips a component that mutates a module-level value during render, so a green test does not prove a component was compiled.
- **Playwright:** service-worker APIs are Chromium-only, and updated SW script requests can't be routed (issue #14711). No official PWA install or manifest guidance, so the manifest and update-flow test plan is inference. WebKit builds exist for win64 and Linux (Ubuntu 22.04/24.04/26.04, Debian 12/13); it is not real Safari.
- **Type stripping:** Vitest transforms `.ts` through Vite and never uses Node's type stripping. `#server/*` subpath imports resolved. Vitest ran a file with an `enum` and a parameter property without complaint, so it will not catch `erasableSyntaxOnly` violations. `tsc` 7.0.2 flags them as TS1294, so `tsc --noEmit` stays the gate. Node type stripping is stable from v24.12.
- **Postgres and Better Auth:** `CREATE DATABASE ... TEMPLATE` fails if any other session is connected to the template, so close all connections to it first. `VITEST_POOL_ID` (1-based) can name per-worker databases cloned from a template built in `globalSetup`. Testcontainers has `snapshot()` and `restoreSnapshot()`; compose is faster locally. Better Auth 1.7.7 documents a `testUtils()` plugin (`better-auth/plugins`) with `login`, `getAuthHeaders`, `getCookies`.
- **Not verified:** `--typecheck` in watch mode, `isMobile` per browser, Node 24 end to end, the Postgres 18 Docker volume change.

# 20 - Testing tooling facts (as of 2026-10-14)

Scope: Vite 8.3.4 SPA, React 19 + React Compiler (`@rolldown/plugin-babel`), TypeScript 7.0.2, Node 24 running server `.ts` via type stripping (`erasableSyntaxOnly`, `#server/*`), Hono 4, Better Auth 1.7.7, Drizzle 0.45.4 on `pg`, Postgres 18 (Docker Compose), installed mobile-first PWA.

## How to read this

Every claim carries a tag:

- **[PRIMARY]**: stated in an official doc, release note, registry metadata or shipped source, linked next to it.
- **[VERIFIED-LOCAL]**: I ran it on 2026-10-14 in a throwaway project outside the repo (Windows 11, **Node 22.17.1**, not Node 24; `vitest@5.0.4`, `vite@8.3.4`, `typescript@7.0.2`, `react@19.3.1`, `babel-plugin-react-compiler@1.0.0`, `@rolldown/plugin-babel@0.2.4`, `@vitejs/plugin-react@6.1.2`, `happy-dom@21.0.1`, `@vitest/browser-playwright@5.0.4`, `playwright@1.64.x`). Reproduction details are in the appendix.
- **[INFERENCE]**: my reasoning from the above; not stated by any source and not tested.

Web fetch summaries of doc pages were produced by a small model. Where a quote matters, re-read the linked page before relying on it.

## Version snapshot (npm registry, [PRIMARY])

Source: `https://registry.npmjs.org/<pkg>` `dist-tags.latest` and its `peerDependencies`/`engines`.

| Package | latest | Published | Notes |
|---|---|---|---|
| vitest | 5.0.4 | 2026-10-12 | peer `vite ^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0`; engines `node ^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`; peer `@types/node ^22 \|\| >=24` |
| vite | 8.3.4 | 2026-10-08 | matches the project |
| typescript | 7.0.2 | 2026-07-08 (7.0.0 GA post date) | `next` tag is `7.1.0-dev.20261014.1` |
| @vitest/browser-playwright | 5.0.4 | 2026-10-12 | peer `playwright *` |
| vitest-browser-react | 2.3.0 | 2026-09-04 | peer `react ^18 \|\| ^19`, `vitest ^4 \|\| ^5` |
| playwright / @playwright/test | 1.64.1 | 2026-10-14 | Chromium 156, Firefox 157, WebKit 27.2 |
| @testing-library/react | 16.3.3 | 2026-08-27 | peer `@testing-library/dom ^10` (dom latest 10.4.2) |
| happy-dom | 21.0.1 | 2026-10-12 | engines node >=20 |
| jsdom | 30.1.2 | 2026-10-04 | engines `node ^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` |
| testcontainers / @testcontainers/postgresql | 12.2.1 | 2026-10-13 | testcontainers engines `node >= 22.22` |
| better-auth | 1.7.7 | 2026-09-30 | peer `vitest ^2 .. ^5`, `drizzle-orm ^0.45.2 \|\| >=1.0.0-rc.1`, `pg ^8` |

## Q1. Vitest version, Vite 8.3.4 / TS 7.0.2 compatibility, `vitest --typecheck` under TS 7

**Current version.** Vitest **5.0.4** (2026-10-12). 5.0.0 shipped 2026-09-03. [PRIMARY: [releases](https://github.com/vitest-dev/vitest/releases), registry]

**Vite 8.3.4.** Vitest 5.0.4 declares peer `vite ^6.4.0 || ^7.0.0 || ^8.0.0`, so 8.3.4 is in range. [PRIMARY: registry]. The migration guide states Vitest 5 requires Vite >= 6.4.0 and Node >= 22.12.0. [PRIMARY: [migration](https://vitest.dev/guide/migration)]. [VERIFIED-LOCAL] it installs and runs against `vite@8.3.4`.

**TypeScript 7.0.2.**
- TS 7.0 is the native (Go) port. It ships a new `tsc` executable, **no programmatic API in 7.0**, and a "new (and different) API" is expected in 7.1. `typescript` 7.0.2's `exports` has `"."` -> `lib/version.cjs` (exports only `version`), plus `./unstable/*` entries. [PRIMARY: [TS 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), package contents of `typescript@7.0.2` inspected locally]
- `@typescript/typescript6` provides a `tsc6` bin and the 6.0 API side by side for tools that need the old API. [PRIMARY: announcement]
- 7.0 tsconfig default changes include `strict: true`, `module: esnext`, `types: []` (so `@types/node` must be listed in `types` explicitly), `rootDir: ./`, `noUncheckedSideEffectImports: true`. `baseUrl`, `moduleResolution: node/node10/classic`, `target: es5` are removed. [PRIMARY: announcement]
- Vitest's own runtime does not need the TS API. The Vitest transform uses Vite's built-in TS handling (see Q5). [VERIFIED-LOCAL] Vitest 5.0.4 + TS 7.0.2 runs tests fine.

**How `vitest --typecheck` works (and under TS 7).**
- Docs: Vitest "calls `tsc` or `vue-tsc` ... and parses results"; it runs `tsc --noEmit`; type tests are `*.test-d.ts` by default; source type errors fail the run unless `typecheck.ignoreSourceErrors`. Typecheck is labelled experimental. Options: `enabled`, `only`, `checker` (default `tsc`; may be a path to a custom binary that emits `tsc`-style output), `include`, `exclude`, `allowJs`, `ignoreSourceErrors`, `tsconfig`, `spawnTimeout` (10 s). [PRIMARY: [testing types](https://vitest.dev/guide/testing-types), [typecheck config](https://vitest.dev/config/typecheck)]
- Implementation (shipped `vitest@5.0.4` `dist/chunks/index.B8VfM7Mf.js`, class `Typechecker.spawn`): spawns the checker as a **child process** with `--pretty false --noEmit --incremental --tsBuildInfoFile <tmp> [--watch] [--allowJs --checkJs] [-p <tsconfig>]` (or `--build` when `typecheck.build`), then parses stdout. It checks that the `typescript` package is installed, but does not import the TS API. [PRIMARY: shipped source]
- **Under TS 7.0.2 it works.** [VERIFIED-LOCAL] `npx vitest run --typecheck` with `typescript@7.0.2`: a `*.test-d.ts` using `expectTypeOf` passed, and a deliberate type error plus `erasableSyntaxOnly` violations in a source file were reported as "Unhandled Source Error ... TypeCheckError" with correct file:line:col. Note that source errors are reported as *errors* (non-zero exit), not as failed tests.
- Reason it works: the interface is the CLI contract (`tsc` bin + `tsc`-formatted output), which TS 7 keeps. [INFERENCE] This is a CLI contract, so a future TS output-format change is the risk, not the missing JS API.
- No Vitest doc or release note I found mentions tsgo/TS 7 explicitly. [PRIMARY-absence: typecheck pages above say nothing about it]
- Practical advice [INFERENCE]: keep a plain `tsc --noEmit` (or `tsc -b`) as the project typecheck gate and treat `vitest --typecheck` as only for `*.test-d.ts` type-level tests. It is experimental, spawns a second `tsc` run, and reports source errors a second time.
- `tsc` caveat that can bite: TS 7 fails when files are passed on the command line while a `tsconfig.json` exists (needs `--ignoreConfig`). Vitest passes `-p <tsconfig>` only when `typecheck.tsconfig` is set; otherwise it passes no path and tsc finds `tsconfig.json` in `cwd` (the project root). [PRIMARY: announcement + shipped source; works in the local run]
- Also [VERIFIED-LOCAL]: `types: ["node"]` was needed in tsconfig (TS 7 default `types: []`).

## Q2. Vitest browser mode vs happy-dom/jsdom for React 19 + React Compiler

**Maturity.**
- Browser mode is a first-class, documented feature in 5.x; the `browser` config page and the guide carry no "experimental" label (typecheck, by contrast, is labelled experimental). Vitest 5.0.x release notes show active work: 5.0.4 "browser instances now run as workers" (warning: may degrade performance with a custom `maxWorkers`), 5.0.3 delayed server listen/mock path checks/`toMatchScreenshot` fix. [PRIMARY: [browser guide](https://vitest.dev/guide/browser/), [releases](https://github.com/vitest-dev/vitest/releases)]. Absence of a label is not an affirmative stability promise.
- Vitest 5.0 contains **7 browser-mode breaking changes** (locators strict by default, `toHaveTextContent` strict equality, automocks, screenshot dir config ...). Pin versions. [PRIMARY: [migration](https://vitest.dev/guide/migration)]
- Providers: `playwright` (recommended for CI/parallel), `webdriverio`, `preview` (simulated events; not recommended outside previewing). Playwright provider browsers: Chromium, Firefox, WebKit. [PRIMARY: [browser guide](https://vitest.dev/guide/browser/), [playwright provider](https://vitest.dev/guide/browser/playwright)]
- Packages: `@vitest/browser-playwright` (peer `playwright *`, version locked to vitest) and `vitest-browser-react` 2.3.0 (peer React 18/19). [PRIMARY: registry]. Its README says it needs vitest >= 4, cleans up *before* each test, `render` is async, uses locators with retry (`expect.element`), clicks go through CDP, and `renderHook` exists. [PRIMARY: [README](https://github.com/vitest-dev/vitest-browser-react)]. The README does not mention React 19 or React Compiler specifically.

**Docs-stated tradeoffs.** jsdom/happy-dom "only simulate a browser environment", with possible false positives/negatives, but are simpler to set up; browser mode has longer start-up and does not replace E2E runners. [PRIMARY: [why browser mode](https://vitest.dev/guide/browser/why)]. Playwright provider: new context per test file, **one page per file** (isolation is per file, not per test), `serviceWorkers: 'allow'` always set by Vitest, viewport must be set via `test.browser.viewport` not `contextOptions` (lost in headless), `launch.headless` ignored (use `test.browser.headless`). [PRIMARY: [playwright provider](https://vitest.dev/guide/browser/playwright)]. `browser` is not an "environment"; mixing modes needs test **projects**. [PRIMARY: [environment](https://vitest.dev/guide/environment)]

**Verified locally.**
- [VERIFIED-LOCAL] Browser mode on **Windows 11** with **Chromium 156 and WebKit 27.2** (`instances: [{browser:'chromium'},{browser:'webkit'}]`), `vitest-browser-react` `render`, `locator.click()`, `expect.element(...)`. A compiled component rendered and memoized correctly in both (see Q3). Test run of the one file took about 0.3 s (chromium) / 0.7 s (webkit) after browsers were installed; whole command about 3 s.
- [VERIFIED-LOCAL] In browser mode `toHaveTextContent("count 2")` did **not** match text "count 2 / 10": it is strict equality in v5 (matches the migration note). jest-dom's version is substring. Use a regexp for partial matches.

**Tradeoffs [INFERENCE] for this project.**
- Use happy-dom (or jsdom) for the bulk of component logic tests: fastest, no browser binaries, works with `@testing-library/react`. Use browser mode (Chromium + WebKit) for tests where real layout, focus, touch/pointer, CSS, `matchMedia`, IntersectionObserver, `navigator.serviceWorker`, or Safari-specific behaviour matter.
- WebKit via Playwright is the cheap way to catch Safari/iOS-class bugs for an installed mobile PWA, but it is a Playwright WebKit build, not Safari (see Q4).
- happy-dom 21.0.1 / jsdom 30.1.2 engines: jsdom 30 needs Node `^22.22.2 || ^24.15.0 || >=26`. Node 24 must be >= 24.15.

## Q3. Pitfalls testing React Compiler-compiled components with Testing Library

**What the sources say.**
- The compiler skips code it cannot safely optimise rather than failing; problems from Rules-of-React violations show up as effects over-firing, infinite loops, missing updates. Isolation tools: `"use no memo"` directive (temporary debugging aid), removing manual memoization, ESLint, ✨ badge in DevTools. [PRIMARY: [debugging](https://react.dev/learn/react-compiler/debugging)]
- Compiler options `compilationMode`, `target`, `panicThreshold`, `logger`, `gating`. [PRIMARY: [configuration](https://react.dev/reference/react-compiler/configuration)]. The React docs (configuration, debugging, 1.0 post) say **nothing about test runners / Testing Library / Vitest**; the 1.0 post only recommends continuous E2E testing and pinning the compiler version exactly if coverage is weak. [PRIMARY: [1.0 post](https://react.dev/blog/2025/10/07/react-compiler-1)]. So there is **no official guidance** on testing compiled components; everything below beyond that is local evidence or inference.
- `@vitejs/plugin-react` 6.x enables the compiler via `babel({ presets: [reactCompilerPreset()] })` from `@rolldown/plugin-babel`. [PRIMARY: [plugin-react README](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react)]

**Verified locally (all [VERIFIED-LOCAL]; Vitest 5.0.4, happy-dom).**
1. **The compiler does run under Vitest** when you reuse the same plugin config. A component with an expensive derived value was called once across three renders (memoized), as expected from compiled output.
2. **It only runs for client-consumer environments.** The shipped `reactCompilerPreset` sets `rolldown.applyToEnvironmentHook: env => env.config.consumer === "client"` and a code filter `/forwardRef|memo|\b(?:[A-Z]|use[A-Z0-9])/` (`@vitejs/plugin-react@6.1.2` `dist/index.js` [PRIMARY: shipped source]). Result: the same component was compiled in a `happy-dom` file and **not compiled** in a file with `// @vitest-environment node`. If you test components under `node` (e.g. `renderToString`), the compiler is off, so tests exercise a different build of the code than the browser gets. Keep component tests in `happy-dom`/`jsdom`/browser mode.
3. **Silent bail-out.** My first test component mutated a module-level counter during render. The compiler skipped it without any error and the test passed uncompiled. A green test says nothing about whether a component was optimised. Add a `logger` (`logEvent` for `CompileSuccess` / `CompileError`) or `panicThreshold: 'all_errors'` in CI to fail on skipped components (options per React docs; the specific CI usage is [INFERENCE]).
4. Detecting compilation in a test: transformed function source contains `$[0]` cache slots (SSR transform rewrites `_c(n)` into `__vite_ssr_import_x__.c(n)`, so grep `$[` rather than `_c(`).
5. `@testing-library/react` 16.3.3 + `@testing-library/dom` 10.4.2 + `user-event` 14.6.8 + React 19.3.1 rendered and clicked compiled components fine in happy-dom.
6. `@babel/core` resolved to `8.0.0-rc.4` when installed unpinned with `@rolldown/plugin-babel@0.2.4` and `babel-plugin-react-compiler@1.0.0` (npm resolved `latest`). It worked, but is a release candidate; pin deliberately.

**Pitfalls to expect [INFERENCE]:**
- Tests that count renders/calls (like mine) or assert referential identity are testing compiler behaviour, not product behaviour. Prefer asserting on the DOM; if you need to guard memoization-sensitive effects, test with and without `"use no memo"` or pin the compiler version.
- Module-level mocks (`vi.mock`) of hooks/utilities used by compiled components are fine, but code that relied on non-memoized identity in mocks (`vi.fn()` returned fresh each render) can differ after compilation.
- StrictMode double render: `vitest-browser-react` has StrictMode off by default (configurable via `configure` in `vitest-browser-react/pure`). [PRIMARY: README]. Turning it on in tests is a cheap way to surface Rules-of-React violations. [INFERENCE]

## Q4. Playwright: installed PWA / service worker, WebKit on Windows & Linux CI, mobile emulation

**Service workers.** [PRIMARY: [service workers](https://playwright.dev/docs/service-workers), [BrowserContext](https://playwright.dev/docs/api/class-browsercontext), [release notes](https://playwright.dev/docs/release-notes)]
- Playwright's **service-worker API surface is Chromium-only**: `context.serviceWorkers()` and the `serviceworker` event are documented "only supported on Chromium-based browsers". Network requests made by the SW are reported on the `BrowserContext` and routable (1.57+, Chromium only). `response.fromServiceWorker()` tells whether a SW handled a page request.
- The `serviceworker` event fires before the worker controls the page; the docs show waiting for `controllerchange`/activation before `worker.evaluate()`.
- Known limitation: **requests for the updated SW script itself cannot be routed** ([issue #14711](https://github.com/microsoft/playwright/issues/14711)). So an "update flow" cannot be simulated by routing a new `sw.js`; serve a second build (e.g. two preview servers or a file swapped on disk) instead. [INFERENCE for the workaround]
- `serviceWorkers: 'block'` in context options blocks registration (default `'allow'`). [PRIMARY: [Browser.newContext](https://playwright.dev/docs/api/class-browser)]. Vitest's playwright provider forces `'allow'`.
- `context.setOffline(true)` / `offline` option exist (no Chromium-only note), and do not affect WebRTC. [PRIMARY]
- `newCDPSession` is Chromium-only. [PRIMARY: BrowserContext docs]. Anything needing CDP (e.g. `Page.getAppManifest`, installability checks, forcing display-mode) is Chromium-only. [INFERENCE for the specific CDP methods; CDP restriction is PRIMARY]
- No Playwright doc covers PWA install, manifest, or `beforeinstallprompt`; no PWA entries in 1.57-1.64 notes. [PRIMARY-absence]
- Third-party sources describe lifecycle tests (register -> controller -> update -> `skipWaiting`/`clients.claim`), but I found nothing authoritative; treat as inference. Suggested split [INFERENCE]:
  - Manifest: fetch `/manifest.webmanifest` with `page.request`, assert JSON fields (name, `display`, icons incl. maskable, `start_url`, `scope`, `theme_color`), and assert `<link rel="manifest">` in the page. Runs on every browser.
  - Registration: in Chromium, `await context.waitForEvent('serviceworker')` or `page.evaluate(() => navigator.serviceWorker.ready)`; assert `registration.scope` and `navigator.serviceWorker.controller` after reload.
  - Update: build v1, load, build v2 (different `sw.js`/precache revision), `registration.update()`, assert the app's own "update available" UI and the activation path (skipWaiting vs user-prompted).
  - Offline: load once online, `context.setOffline(true)`, reload, assert shell renders.
  - True install (OS-level A2HS, standalone window) is **not automatable** in Playwright; emulate with `matchMedia('(display-mode: standalone)')` mocks or a Chromium persistent context with CDP. [INFERENCE]
  - Always run PWA specs with a production build (`vite build` + `vite preview`/Hono static), not the dev server. [INFERENCE]

**WebKit support: Windows and Linux.**
- Playwright's WebKit is its own build "derived from the latest WebKit main branch", not branded Safari; the closest-to-Safari option is macOS; Linux CI is the cheapest. [PRIMARY: [browsers](https://playwright.dev/docs/browsers)]
- `registry/index.ts` (Playwright `main`) lists WebKit downloads for **`win64`**, Ubuntu 22.04/24.04/26.04 (x64+arm64), Debian 12/13 (x64+arm64), macOS 14/15/26. 1.58 dropped macOS 13 WebKit, 1.59 dropped macOS 14 WebKit (the file still has a `mac14` override). [PRIMARY: [registry source](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/registry/index.ts), [browsers.json](https://github.com/microsoft/playwright/blob/main/packages/playwright-core/browsers.json), [release notes](https://playwright.dev/docs/release-notes)]. Playwright system requirements: Windows 11+/Server 2019+/WSL, macOS 14+, Debian 12/13 and Ubuntu 22.04/24.04/26.04; Node 22/24/26. [PRIMARY: [intro](https://playwright.dev/docs/intro)]
- [VERIFIED-LOCAL] `npx playwright install chromium webkit` on Windows 11 downloaded "WebKit 27.2 (playwright webkit v2370)" and WebKit ran headless in Vitest browser mode (UA `Version/27.2 Safari/605.1.15`).
- Linux CI: `npx playwright install --with-deps webkit` (docs show the pattern for chromium; `--with-deps` is documented generally). Feature gaps vs Safari (media codecs differ per OS). [PRIMARY: browsers doc]. Whether Windows/Linux WebKit behaves identically to iOS Safari for service worker / storage quirks: not documented. [INFERENCE: treat it as a proxy only; iOS-specific PWA behaviour needs a real device]
- Playwright's service-worker APIs are Chromium-only, but the WebKit engine can still run a page's SW in principle; that is not covered by docs. [INFERENCE]

**Mobile emulation.**
- Devices come from the `devices` registry (e.g. `...devices['iPhone 15']`) spread into a project's `use`; options `viewport`, `isMobile` ("whether the meta viewport tag is taken into account and touch events are enabled"), `hasTouch`, `deviceScaleFactor`, `userAgent`, plus `offline`, `colorScheme`, `geolocation`. [PRIMARY: [emulation](https://playwright.dev/docs/emulation), [test-use-options](https://playwright.dev/docs/test-use-options), [Browser.newContext](https://playwright.dev/docs/api/class-browser)]. The docs fetched did not state per-browser limitations for `isMobile`; Playwright has historically not supported `isMobile` in Firefox. [INFERENCE from memory; verify before relying on it]
- "Pre-configured devices assume a specific platform" (UA only); emulation is not a real phone. [PRIMARY: emulation doc]
- A reasonable matrix [INFERENCE]: `Pixel 7` (Chromium, full SW/CDP APIs) for PWA specs, `iPhone` device preset on WebKit for layout/touch regressions, desktop Chromium for the rest.

## Q5. Running Node-24-type-stripped server code in Vitest

**Node side [PRIMARY: [Node TypeScript docs](https://nodejs.org/api/typescript.html)].**
- Type stripping: stable since v24.12.0 (and v25.2.0); no experimental warning since v24.3.0; enabled by default since v22.18/v23.6. Node ignores `tsconfig.json` (no `paths`). Unsupported: `enum`, runtime `namespace`, parameter properties, import aliases (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`); `--experimental-transform-types` removed in v26. `.tsx` unsupported. File extensions mandatory (`./x.ts`). `import type` required for type-only imports. Not applied under `node_modules`. Recommended tsconfig: `noEmit`, `target esnext`, `module nodenext`, `rewriteRelativeImportExtensions`, `erasableSyntaxOnly`, `verbatimModuleSyntax`. Subpath imports (must start with `#`) are the supported alias mechanism.

**Vitest side.**
- Vitest does **not** use Node's type stripping for test/source files. It transforms `.ts` through Vite (vite-node style module runner / environment transform; `vite@8` bundles Rolldown/Oxc). [VERIFIED-LOCAL] Source files with `enum` and a parameter property loaded and ran fine in Vitest, while `tsc` (and Node's stripper) rejects them. [INFERENCE for the Oxc detail; the transform path is confirmed from shipped source calling `project.vite.environments.{client,ssr}.transformRequest`, PRIMARY]
- **Consequence:** Vitest will **not** catch `erasableSyntaxOnly` violations or missing `import type`/`.ts` extensions that Node would reject at runtime. Gates for that are `tsc --noEmit` with `erasableSyntaxOnly` (verified: TS 7.0.2 flags them as TS1294) plus, optionally, a smoke test that spawns `node src/server/main.ts` (or imports via a child process). [VERIFIED-LOCAL + INFERENCE]
- **`#subpath` imports:** [VERIFIED-LOCAL] `"imports": {"#server/*": "./src/server/*.ts"}` in `package.json` resolved correctly in Vitest 5.0.4 / Vite 8.3.4, both from test files and between source files (and `./util.ts` explicit extensions also work). Docs: custom conditions in `exports`/`imports` are not honoured by default; set `ssr.resolve.conditions`. [PRIMARY: [common errors](https://vitest.dev/guide/common-errors)]. Note this `imports` map must be in the `package.json` nearest the files (monorepo workspaces: per package).
- `erasableSyntaxOnly` itself has no Vitest interaction; it is purely a tsc check. `verbatimModuleSyntax` plus `import type` is what keeps Vite's transform and Node's stripper in agreement. [INFERENCE]
- Tests that need exactly Node's loader semantics (e.g. startup script, `--env-file`, top-level await ordering) should be spawned child-process tests, not in-process Vitest imports. [INFERENCE]
- Caveat on my verification: local Node was 22.17.1 (not 24); Vitest never calls Node's stripper, so this should not change the result. [INFERENCE]

## Q6. Test database patterns for Postgres 18; Better Auth testing

**`CREATE DATABASE ... TEMPLATE`** [PRIMARY: [CREATE DATABASE (v18)](https://www.postgresql.org/docs/18/sql-createdatabase.html), [Template Databases (v18)](https://www.postgresql.org/docs/18/manage-ag-templatedbs.html)]:
- Default template is `template1`; any database can be used as a template via `TEMPLATE name`.
- "No other sessions can be connected to the template database while it is being copied"; `CREATE DATABASE` fails if any other connection exists, and new connections to the template are blocked during the copy. So: build the template (migrations + seed), **close every connection to it** (including your migrator's pool), then clone per worker. If many workers clone concurrently they will contend for the lock on the template: create the clones serially (or in `globalSetup`) [INFERENCE from the locking rule].
- `STRATEGY`: `WAL_LOG` (default; block-by-block, best for small templates) vs `FILE_COPY` (forces checkpoints before/after; affected by `file_copy_method`). For a small test schema, default is right. Postgres 18 docs describe `file_copy_method`; I did not test it.
- Encoding/locale must match the template unless `template0` is used. If you build the template from `template0` with a specific locale, clones inherit it. `datistemplate` can be set so that any role with `CREATEDB` may clone it.
- No `COPY DATABASE` facility is intended; large templates make copying slower. [PRIMARY: template databases page]

**Per-worker databases in Vitest.**
- Vitest sets `VITEST_POOL_ID` (1..`maxWorkers`) and `VITEST_WORKER_ID` in each worker (5.0 made these ids 1-based). [PRIMARY: [migration](https://vitest.dev/guide/migration), shipped `dist/chunks/init.*.js`]. Default pool is `forks`; `fileParallelism: false` is the doc'd escape hatch when tests share a DB. [PRIMARY: [parallelism](https://vitest.dev/guide/parallelism)]
- `globalSetup` runs once before workers, in a separate scope; use `project.provide()` / `inject()` for data; teardown runs after all files. [PRIMARY: [globalSetup](https://vitest.dev/config/globalsetup)]
- Suggested layout [INFERENCE]: `globalSetup` -> connect to the compose Postgres as superuser, drop/create `app_template`, run Drizzle migrations against it, disconnect, then create `app_test_<n>` for n in 1..`maxWorkers` (`CREATE DATABASE ... TEMPLATE app_template`) and `provide` the base URL. A per-file `setupFiles` hook builds the connection URL from `VITEST_POOL_ID`. Within a worker, files run sequentially, so each file should reset state (truncate, or wrap in a transaction/savepoint if the code under test permits). Drop the `app_test_*` databases in teardown (and at the start, to clear crashed runs).
- The one thing I did not verify: that `VITEST_POOL_ID` is stable per worker under Vitest 5 `forks` with `isolate: true` (default). Source comment says "Value is between 1-`maxWorkers`", which is enough to size a pool of databases. [PRIMARY: shipped source comment]

**Testcontainers vs docker compose service.**
- `@testcontainers/postgresql` 12.2.1 (needs Node >= 22.22, Docker/compatible runtime). It offers `container.snapshot()` / `restoreSnapshot()` (template-database based; connections must be closed first; database name must not be `postgres`). [PRIMARY: [Postgres module](https://node.testcontainers.org/modules/postgresql/), registry]. The module docs I fetched say nothing about reuse.
- Tradeoffs [INFERENCE]: Testcontainers gives hermetic, version-pinned containers started by the test run itself (good for CI and fresh clones), at the cost of a Docker dependency and container start time (seconds) per run. A compose service you already run for dev is faster for local inner-loop and matches the production-like image (`postgres:18`), but state leaks between runs unless every run drops/creates its own databases (which the template scheme above does) and CI must start the service. A hybrid: use compose locally and a CI service container (or Testcontainers) with the same image tag and the same `globalSetup`.
- Use the `postgres:18` image tag in both. Postgres 18 images changed their data directory layout (volume mount at `/var/lib/postgresql` rather than `/var/lib/postgresql/data`); this affects the dev compose volume, not the tests. [INFERENCE from memory; verify against the Docker Hub `postgres` image page before changing volumes]

**Better Auth testing guidance (1.7.7).**
- Official **Test Utils plugin**: `testUtils()` from `better-auth/plugins`, added to a **test-only auth instance** (e.g. `auth.test.ts`); helpers via `(await auth.$context).test`. Registers no HTTP routes but exposes privileged helpers. [PRIMARY: [Test Utils](https://better-auth.com/docs/plugins/test-utils)]
  - Factories (no DB writes): `createUser`, `createOrganization`.
  - DB helpers: `saveUser`, `deleteUser` (+ org helpers if the organization plugin is used).
  - Auth helpers: `login` (returns `session`, `user`, `headers`, `cookies`, `token`), `getAuthHeaders` (a `Headers` with the session cookie), `getCookies` (cookie objects usable with Playwright/Puppeteer; optional `domain`).
  - OTP capture: `captureOTP: true` then `getOTP(identifier)`, `clearOTPs()`.
  - Warning: do not include it in production config; conditionally spreading `testUtils()` can break `ctx.test` type inference.
- Package notes [PRIMARY: registry]: `better-auth@1.7.7` exports `./test` and `./plugins`. A separate `@better-auth/test-utils` 1.7.7 exists but its description is "Testing utilities for Better Auth adapter development" (exports `./adapter`, `./scim`); it is for adapter authors, not app tests. `better-auth` declares peer `vitest ^2..^5`, `drizzle-orm ^0.45.2`, `pg ^8`, so 1.7.7 and Vitest 5 / Drizzle 0.45.4 are compatible on paper.
- The options page: `secret` falls back to a placeholder when unset (throws in production); `baseURL` from `BETTER_AUTH_URL` or inferred (not recommended); rate limiting `enabled` defaults to true in production and false in development (behaviour for `NODE_ENV=test` is not stated). [PRIMARY: [options](https://better-auth.com/docs/reference/options)]. Set `secret`, `baseURL` explicitly and rate limiting off/explicit in the test auth instance. [INFERENCE]
- No page at `/docs/concepts/testing` exists (404 on 2026-10-14). The doc'd route is the Test Utils plugin page. A `better-auth.nuxt.dev` guide exists but is third party and not read.
- Pattern [INFERENCE]: integration tests create the Hono app with an `auth` instance that uses the per-worker Drizzle connection + `testUtils()`, call `login()` to obtain `headers`, and pass them to `app.request(...)`. For Playwright E2E, `getCookies({domain})` injects an authenticated session via `context.addCookies`, skipping the UI sign-in flow except in one dedicated sign-in test.

## Open questions / not verified

- Vitest `--typecheck` in `--watch` mode with TS 7 (the code passes `--watch`; not run).
- Exact Playwright behaviour of a WebKit SW (register/update) on Windows/Linux; Playwright's PWA install story (no docs).
- `isMobile` per-browser support in the current Playwright (fetched docs silent).
- `VITEST_POOL_ID` behaviour under heavy `maxWorkers` changes; Postgres 18 `file_copy_method`; Postgres 18 Docker volume layout change.
- Node 24 (>= 24.12) end to end: local runs used Node 22.17.1.
- React Compiler `compilationMode`/`logger` CI usage for detecting bail-outs (config options exist per docs; the exact `logEvent` payloads were not exercised).

## Appendix: local reproduction (scratchpad, not committed)

Throwaway project in the session scratchpad (`.../scratchpad/exp`, outside the repo). `package.json`: `"type":"module"`, `"imports":{"#server/*":"./src/server/*.ts"}`. tsconfig: `module/moduleResolution: nodenext`, `erasableSyntaxOnly`, `rewriteRelativeImportExtensions`, `allowImportingTsExtensions`, `noEmit`, `strict`, `types:["node"]`.

- `vitest run --typecheck`: 2 test files passed, type test passed; with `bad.ts` (enum, parameter property, `const n: number = "s"`) it printed 3 `TypeCheckError` source errors while the runtime tests passed. `tsc -p tsconfig.json --pretty false` (7.0.2) printed TS1294 x2 and TS2322.
- Compiler config used: `plugins: [react(), babel({ presets: [reactCompilerPreset()] })]`, `test.environment: "happy-dom"`.
- Compiled check: render `Counter` three times (initial + 2 clicks) -> expensive call counted once.
- Env check: same file with `// @vitest-environment node` -> not compiled; with happy-dom -> compiled (`$[0]` present).
- Browser mode: `provider: playwright()`, `instances: [chromium, webkit]`, headless, `vitest-browser-react` `render`; both engines passed the render/click/memoization assertions.

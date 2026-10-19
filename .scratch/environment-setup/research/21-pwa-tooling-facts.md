# 21 - PWA tooling facts (Vite 8.3.4 SPA, Hono on Railway, online-first shell cache)

Researched 2026-10-14. Nothing was scaffolded.

Legend used on every claim:
- **[P]** primary source, fetched or read directly this session (link given).
- **[P-src]** primary: read from the published npm tarball source of the package itself (`npm pack vite-plugin-pwa@2.0.0`, `npm view ...`).
- **[I]** inference or recommendation by the researcher. Not stated by a source.
- **[U]** unverified or could not be retrieved. Treat as a open item.

Doc-site caveat: the vite-pwa docs site says it documents "Vite Plugin PWA v1.2.0" (assets-generator page), and several pages are thinner than the code. Where docs and package source disagree, the package source is cited and flagged.

---

## 1. vite-plugin-pwa version, Vite 8.3.4 compatibility, strategies

### Facts
- Latest is **2.0.0**, npm `time.modified` 2026-10-03; `dist-tags.latest = 2.0.0`. [P-src] `npm view vite-plugin-pwa`
- Peer deps of 2.0.0: `vite ^3.1 || ^4 || ^5 || ^6 || ^7 || ^8`, `workbox-build ^7.4.1`, `workbox-window ^7.4.1`, `@vite-pwa/assets-generator ^1.0.0 || ^2.0.0`. [P-src]
- Vite 8 support was added in **v1.3.0** ("adds Vite 8 peer dependency support", also adds the `onNeedReload` client callback). Release page shows day/month only (05 May); the year is not shown, 2026 is inferred. [P] https://github.com/vite-pwa/vite-plugin-pwa/releases
- v2.0.0 notes: "next major release"; only flagged breaking item is allowing `@vite-pwa/assets-generator ^2.0.0` as a peer (#946); README breaking-change note updated (#953). [P] https://github.com/vite-pwa/vite-plugin-pwa/releases/tag/v2.0.0
- **v2.0.0 requires Node >= 20.19.0** (README "Install" section; `engines.node` in package.json). [P] https://github.com/vite-pwa/vite-plugin-pwa/blob/main/README.md, [P-src]
- Vite 8.3.4 `engines.node` = `^20.19.0 || >=22.12.0`. [P-src] `npm view vite@8.3.4 engines`. So the Node floor is effectively the same; Railway must run Node >= 20.19 (build) - [I] set it explicitly.
- `workbox-window` latest 7.4.1 and `workbox-build` 7.4.1 match the peer range. [P-src]
- Docs "How the plugin works": generates manifest, generates the SW via `strategies`, generates the register script; uses `workbox-build`. [P] https://vite-pwa-org.netlify.app/guide/

### Alternatives
- **No alternative needed.** vite-plugin-pwa 2.0.0 declares Vite 8 in its peer range and is actively released (Oct 2026). [I] An alternative (hand-written SW + `workbox-build` in a small Vite plugin, or `serwist`) was not evaluated against sources and is not recommended unless vite-plugin-pwa regresses with Vite 8.3.x. [U] No real-world Vite 8.3.4 + plugin 2.0.0 build was run; verify with one smoke build at scaffold time.

### generateSW vs injectManifest
- generateSW (default): "you don't need to write the code for the service worker". injectManifest: plugin "will compile your custom service worker and inject its precache manifest". Select with `strategies`. [P] https://vite-pwa-org.netlify.app/guide/service-worker-strategies-and-behaviors.html
- injectManifest: use `precacheAndRoute(self.__WB_MANIFEST)`, strongly recommended `cleanupOutdatedCaches()`; for prompt flow add a `message` listener that calls `self.skipWaiting()` on `{type:'SKIP_WAITING'}`. [P] https://vite-pwa-org.netlify.app/guide/inject-manifest.html
- Plugin defaults for generateSW (from source): `cleanupOutdatedCaches: true`, `navigateFallback: "index.html"`, `offlineGoogleAnalytics: false`; `skipWaiting`/`clientsClaim` forced true only when `registerType: 'autoUpdate'` (and injectRegister auto/null). Default manifest values include `display: standalone`, `theme_color: "#42b883"` (Vue green - must override). [P-src] `dist/index.js` ~L832-877
- Workbox generateSW defaults: `skipWaiting` false (adds a SKIP_WAITING message listener), `clientsClaim` false, `globPatterns ["**/*.{js,wasm,css,html}"]`, `navigateFallback` null (plugin overrides to index.html), `navigateFallbackDenylist` RegExp[] (denylist wins over allowlist). [P] https://developer.chrome.com/docs/workbox/modules/workbox-build
- Workbox guidance: precache less rather than more; precached HTML is served from cache until the SW updates; do not precache favicon/responsive image sets. [P] https://developer.chrome.com/docs/workbox/precaching-dos-and-donts

### Recommendation for online-first shell-only
- **[I] Use `generateSW`, `registerType: 'prompt'`.** It precaches the Vite build output (hashed JS/CSS + index.html + icons) and registers *no* runtime routes unless `runtimeCaching` is set, so nothing but the shell is cached. injectManifest only earns its cost if you need custom SW logic (push, background sync, custom fetch handlers); you do not.
- **[I]** Suggested workbox block: `navigateFallback: 'index.html'`, `navigateFallbackDenylist: [/^\/api\//]` (plus any other server-rendered path), `globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']`, no `runtimeCaching`, leave `cleanupOutdatedCaches` at default true, do not set `skipWaiting`/`clientsClaim`.
- **[I]** Because the app is online-first, an offline navigation will serve the cached shell, whose API calls then fail - the UI needs its own offline/error state. This is a product decision, not a plugin setting.

---

## 2. Update flow API and safe application

### API (read from package source; docs pages are thinner)
- `registerType` prompting is the default ("No configuration needed"). [P] https://vite-pwa-org.netlify.app/guide/prompt-for-update.html
- `registerSW(options)` from `virtual:pwa-register` accepts `immediate`, `onNeedReload`, `onNeedRefresh`, `onOfflineReady`, `onRegistered`, `onRegisteredSW(swUrl, registration)`, `onRegisterError`. Returns `updateServiceWorker`. [P-src] `dist/client/build/register.js`. The React docs page only lists `onRegistered`/`onRegisterError`, and says it can't be relied on for the rest [P] https://vite-pwa-org.netlify.app/frameworks/react.html - the source is authoritative.
- React: `import { useRegisterSW } from 'virtual:pwa-register/react'` returns `offlineReady`, `needRefresh` (each `[boolean, setter]`) and `updateServiceWorker(reloadPage?)`. Needs `workbox-window`. TS: add `"vite-plugin-pwa/react"` (or `vite-plugin-pwa/client`) to `compilerOptions.types`. Docs warn: hook options "are not reactive" - pass stable callbacks. [P] react page above
- Prompt-mode mechanics [P-src]: listens to Workbox `waiting` (and `installed` with `isExternal`) -> calls `onNeedRefresh`. `updateServiceWorker()` only calls `wb.messageSkipWaiting()` (sends `{type:'SKIP_WAITING'}`). When the new worker takes control (`controlling` event, `isUpdate`), it calls `onNeedReload()` if given, **otherwise `window.location.reload()`**.
- **Behaviour change to note:** in 2.0.0 source the argument is declared `_reloadPage = true` and is unused; the reload decision is made by the `controlling` handler and `onNeedReload`, not by the `reloadPage` argument. The React docs still describe `updateServiceWorker(true)`. [P-src] vs docs; treat the boolean as a no-op and use `onNeedReload` to control reload. [I] Verify in a test at scaffold time.
- Workbox-window: reloading the page does **not** activate a waiting worker; `controlling` only fires if the worker calls `skipWaiting()`; `isExternal` marks updates from another tab. [P] https://developer.chrome.com/docs/workbox/modules/workbox-window
- Caveat from docs: Workbox-window uses a time heuristic - if a new SW registers < 1 minute after the last registration, the wrong dialog can appear. [P] react page
- Periodic checks: the docs example calls `registration.update()` in a `setInterval` (hourly) from `onRegisteredSW/onRegistered`. [P] react page. Browser also checks on navigation unless checked within 24h. [P] https://web.dev/articles/service-worker-lifecycle ; `update()` bypasses caches if last fetch > 24h ago. [P] https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update

### Safe-apply design (all [I], built on the API above)
1. `onNeedRefresh` only sets `needRefresh = true`; render a non-blocking banner. Never auto-call `updateServiceWorker`.
2. Pass `onNeedReload` so the reload is yours, not an unconditional `location.reload()`. In it: persist any dirty drafts (IndexedDB/localStorage) first, then reload.
3. Gate the Update button: if there are unsaved edits, either save-then-update or show "Save first" - do not disable the banner, defer it.
4. On next boot, restore drafts and show a "restored" notice.
5. Trigger `registration.update()` on `visibilitychange -> visible` and `online` (installed iOS/Android PWAs are suspended, not reloaded, so the timer-only approach is weak - see section 3), plus a long interval.
6. Multi-tab: a tab that did not click Update may still receive `waiting`/external events; do not reload tabs that did not consent. Test with 2 tabs.
7. Keep the old-version/new-version compatibility in mind: after `skipWaiting`, old pages can be served by the new worker, which can break if API/asset contracts differ ([P] lifecycle article warns of this). With hashed Vite assets plus cleanup this window is small, but old chunks missing from the new precache will 404 in a stale tab. [I]

---

## 3. iOS/iPadOS Safari installed PWA, Android Chrome

### Primary-source facts
- **iOS/iPadOS 26: every site added to Home Screen opens as a web app by default**; user can turn off "Open as Web App" in the add dialog. "There are now zero requirements for 'installability' in Safari." Manifest still honoured (icons, etc.). Service workers were never required. SVG icons supported everywhere in Safari 26.0. [P] https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- Safari 26.0 adds Web Inspector options to auto-inspect/pause new service workers of a Home Screen web app (useful for debugging updates). [P] same post
- Install is user-driven from the Share sheet ("Add to Home Screen"); on iOS 16.4+ also from Chrome, Edge, Firefox, Orion; **`beforeinstallprompt` is not supported on iOS**. [P] https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable ; Safari 17 post also adds Home Screen from Safari View Controller [P] https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-0/
- **Storage eviction:** ITP deletes script-writable storage (incl. "Service Worker registrations and cache", IndexedDB, LocalStorage) after 7 days of Safari use without interaction. **Home Screen web apps have their own counter of days of use**; WebKit says it does not expect first-party data in them to be deleted and calls such deletion a serious bug. [P] https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
- Quotas: origin up to 60% of disk (browser apps) / 15% (other apps); overall 80%/20%; Home Screen web apps get the same quotas as in-browser. Eviction on quota exceed, storage pressure, or unused origin; origins in persistent mode are excluded; `navigator.storage.persist()` is granted by heuristics such as being a Home Screen web app. [P] https://webkit.org/blog/14403/updates-to-storage-policy/
- Storage separation: installed web app is a separate storage context from Safari tabs (Safari 17 post mentions cookies copied once at Add to Dock on Mac; no other data shared). [P] https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-0/ [I] same model applies to iOS Home Screen apps - the Safari 17 text is about Dock; do not assume without a device test.
- Status bar: `apple-mobile-web-app-capable` (`yes` = full-screen), `apple-mobile-web-app-status-bar-style` values `default | black | black-translucent`. [P] (archived Apple doc) https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html
- `<meta name="theme-color">` supports a `media` attribute for light/dark. [P] https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color ; MDN marks it not Baseline.
- **Open WebKit bug**: "REGRESSION (Safari 26.2): Status bar background is replaced with shadow on soft navigation"; reporter says a `theme-color` meta "has no effect"; affects Home Screen apps and Safari; status NEW, a PR was linked 2026-03-11, no resolution as of the 2026-06-01 comment (the page as fetched). [P] https://bugs.webkit.org/show_bug.cgi?id=305546
- Android Chrome: `beforeinstallprompt` fires once installability criteria are met; pattern is `preventDefault()`, stash event, show own button, call `event.prompt()`, read `outcome`. Hide the button by default because not all browsers fire it. [P] https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event . Chrome additionally requires the user to have interacted and spent >= 30 seconds on the page (web.dev page "Last updated 2024-09-19" - may be stale). [P] https://web.dev/articles/install-criteria

### Not found in primary sources
- **[U] How/when iOS checks for SW updates for an installed app.** No Apple or WebKit document found. Only user-reported WebKit bugs and forum posts (older iOS versions): installed apps serving stale assets until relaunch/reboot, WebKit engineer comment that the SW may be terminated when idle (e.g. https://bugs.webkit.org/show_bug.cgi?id=199110). These are secondary/old; current iOS 26 behaviour unverified.
- **[U] Safari 27 release notes** (Safari 27 beta existed in 2026 per search snippets): Apple's release-notes page returned no content to the fetcher; web-app/SW changes in 27 unchecked. Re-check https://developer.apple.com/documentation/safari-release-notes and https://webkit.org/blog/ before finalising.
- **[U]** Whether `viewport-fit=cover` + `env(safe-area-inset-*)` is required with `black-translucent` in iOS 26: not re-verified here.

### Inferences / recommendations
- **[I]** Assume an installed iOS PWA is suspended and resumed, not reloaded: run the update check on `visibilitychange` and `pageshow`, not only on a timer. The user-prompt flow is the right design given the reported iOS unreliability; also expose a "Check for updates" action and show the build version in settings so users/support can tell which version is running.
- **[I]** Because `sw.js` and index.html are `no-cache` at the server and the SW script fetch ignores HTTP cache by default anyway (section 5), staleness on iOS is a lifecycle issue, not a header issue.
- **[I]** Persist user drafts in IndexedDB and call `navigator.storage.persist()`; the 7-day ITP cap should not apply to the installed app but does apply to the same site opened in a Safari tab.
- **[I]** Set `theme-color` (with light/dark `media` variants) AND `apple-mobile-web-app-status-bar-style`, but do not rely on `theme-color` alone for iOS 26 status-bar appearance until bug 305546 is resolved; test on a real device. Prefer making the page background (`html`/`body`) match the header colour, as iOS 26 may derive bar colour from page content - this is third-party-reported, not Apple-confirmed [U].
- Install instructions to show iOS users [I]: Share button -> Add to Home Screen -> leave "Open as Web App" on -> Add. Detect `navigator.standalone` / `display-mode: standalone` to hide the hint once installed.

---

## 4. Icon / asset generation

- Package: `@vite-pwa/assets-generator`. Latest **2.0.0** (marked Latest; "Move to ESM only"); 1.0.4 added new iPhone models; 1.0.3 bumped sharp to 0.35.4 (CVE). Release pages show day/month only. [P] https://github.com/vite-pwa/assets-generator/releases . 2.0.0 `engines.node >= 20.19.0`, deps include `sharp ^0.35.4`, `sharp-ico`. [P-src] `npm view`
- SVG source is supported and resized without quality loss. Required: 192x192 and 512x512 manifest icons, 180x180 apple-touch-icon; suggested: 64x64 (Windows), 512 `any`, 512 `maskable`; favicon.ico + favicon.svg. [P] https://vite-pwa-org.netlify.app/assets-generator/
- Preset **`minimal-2023`** generates: transparent 64/192/512 (padding 0.05), white maskable 512 (padding 0.3), white apple-touch 180 (padding 0.3), `favicon.ico` 48. Names: `pwa-{w}x{h}.png`, `maskable-icon-{w}x{h}.png`, `apple-touch-icon-{w}x{h}.png`. `minimal` preset is deprecated **but is still the CLI default**, so pass `--preset minimal-2023` or a config file. [P] https://vite-pwa-org.netlify.app/assets-generator/cli.html
- Usage: `pwa-assets-generator --preset minimal-2023 public/logo.svg` or `pwa-assets.config.ts` with `defineConfig({ preset: minimal2023Preset, images: [...] })` from `@vite-pwa/assets-generator/config`. [P] pages above
- Docs advise against `purpose: "any maskable"`; use separate entries. Recommended head: `<link rel="icon" href="/favicon.ico" sizes="48x48">`, `<link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml">`, `<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`. [P] assets-generator page
- The main guide lists a "PWA Assets Integration" (serve/generate/inject on the fly through the plugin). [P] https://vite-pwa-org.netlify.app/guide/ - details not read [U].
- **[I]** Doc site targets 1.x; with generator 2.0.0 (ESM-only) the config file must be ESM (`.ts`/`.mts`/`.mjs`); the preset names should be unchanged but confirm with `--help` after install [U]. For one SVG: one source, `minimal-2023`, commit the generated PNGs (do not generate in CI), and design the SVG with the 0.3 padding for maskable in mind (content centred, roughly 60-70% of the canvas).
- Minimum icon set the manifest needs: `pwa-192x192.png`, `pwa-512x512.png` (any), `maskable-icon-512x512.png` (maskable); plus `apple-touch-icon-180x180.png` in HTML only (not the manifest).

---

## 5. Service worker vs Hono cache headers, and keeping /api/* out

### Primary facts
- Browsers by default ignore HTTP cache headers when checking the registered SW *script* for updates (`updateViaCache: 'imports'` default, Chrome 68+); headers *are* respected for `importScripts()` scripts. [P] https://web.dev/articles/service-worker-lifecycle ; https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updateViaCache
- Update check = byte comparison of the script; triggered by navigation to in-scope pages (unless checked < 24h ago) and by `reg.update()`. [P] lifecycle article
- Precaching and HTML: precached HTML is served from cache until the SW updates. [P] https://developer.chrome.com/docs/workbox/precaching-dos-and-donts
- **Cache API refuses non-GET:** `Cache.put()` and `add()` reject with TypeError if the request method is not GET (spec text: "...or innerRequest's method is not `GET`, return a promise rejected with a TypeError"); `match()`/`matchAll()` return empty/false for non-GET unless `ignoreMethod`. [P] https://w3c.github.io/ServiceWorker/ (Cache section)
- `@hono/node-server` `serveStatic` does **not set `Cache-Control` or `ETag`** and does not process conditional request headers; it sets Content-Type, Last-Modified, Content-Length, Accept-Ranges. It exposes `onFound(path, c)` / `onNotFound` callbacks where headers can be set. [P] https://raw.githubusercontent.com/honojs/node-server/main/src/serve-static.ts (read via fetch tool, source of `main` branch, not pinned to the version you will install - hono current is 4.13.13 [P-src] npm view). Hono's docs page for Node does not mention headers. [P] https://hono.dev/docs/getting-started/nodejs

### Recommendations (all [I])
- Hono headers: `/index.html` and navigation fallback and `/sw.js` (and `registerSW.js`, `manifest.webmanifest`): `Cache-Control: no-cache`. `/assets/*` (hashed): `public, max-age=31536000, immutable`. Set these explicitly in `onFound` or a middleware, since serveStatic adds none. `Service-Worker-Allowed` is not needed when `sw.js` is served from `/`.
- `no-cache` on sw.js is harmless (SW script fetch ignores HTTP cache by default) but remains correct for the `workbox-*.js` chunk imported via `importScripts` which *is* subject to HTTP caching - generateSW emits that chunk with a content hash in its filename [U: from memory, check build output] so long cache on it is also safe; simplest rule: `no-cache` for everything not under `/assets/`.
- Keep `/sw.js` exactly where the plugin emits it; serve it with `Content-Type: text/javascript`.
- SPA fallback in Hono must return index.html **only for non-/api, non-file GET navigations**; unknown `/api/*` should return JSON 404. Otherwise the SW's navigateFallback and Hono's fallback hide API errors.
- Never-cache-/api enforcement, defence in depth: (a) no `runtimeCaching` entries at all => the generated SW registers only the precache route and the navigation route, so non-navigation fetches (fetch/XHR, any method incl. POST reads) are not handled by the SW and go straight to the network [I - based on Workbox's route-based model; not individually verified in generated `sw.js`, inspect the built file]; (b) `navigateFallbackDenylist: [/^\/api\//]` for navigation-mode requests to /api; (c) Cache API itself rejects non-GET; (d) `Cache-Control: no-store` on `/api/*` responses from Hono; (e) a CI/test step that greps the built `sw.js` for `/api`, `registerRoute(` and `runtimeCaching`.
- Inspect built `dist/sw.js` once and add a test asserting the precache manifest contains only shell files (no `/api`, no source maps if sourcemaps are on).

---

## 6. Manifest requirements for installability (2026)

- All browsers: manifest linked via `<link rel="manifest">` on every page; served over HTTPS (or localhost). [P] https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- **Chrome / Edge / other Chromium**: `name` or `short_name`; `icons` containing 192px and 512px; `start_url`; `display` (and/or `display_override`) of `standalone`/`fullscreen`/`minimal-ui` (web.dev also lists `window-controls-overlay`); `prefer_related_applications` false or absent. **No service worker required.** Edge criteria are covered by the Chromium list; Edge and Firefox "have similar requirements with minor differences". [P] MDN page above; https://web.dev/articles/install-criteria (last updated 2024-09-19; 2026 changes not independently confirmed [U])
- Chrome desktop/Android and Edge desktop also let users install any site, with or without a manifest. [P] MDN page
- Chrome fires `beforeinstallprompt` only after the criteria + engagement (click/tap and 30s). [P] web.dev page
- **Safari**: macOS Sonoma+/Safari 17+ "Add to Dock" for any site; iOS/iPadOS 26 has zero installability requirements, manifest optional but used (display, name, theme colour, start URL, icons). [P] MDN page; https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ ; https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-0/
- `id`: if missing, defaults to `start_url`; set explicitly with leading `/` and keep stable across releases; limited availability. [P] https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id
- Screenshots + description give a richer Chrome install UI (recommended, not required). [P] web.dev install-criteria

### Suggested manifest ([I], combines the above)
`name`, `short_name`, `id: "/"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color`, `theme_color` (override the plugin default `#42b883`), `lang`, `icons`: 192 (any), 512 (any), 512 (maskable) as separate entries, optionally `screenshots` (wide + narrow). Keep `theme_color` equal to the `<meta name="theme-color">` light value.

---

## Open items to verify at scaffold time
1. One smoke build of Vite 8.3.4 + vite-plugin-pwa 2.0.0 + workbox 7.4.1 on Node 20.19+/22.12+ (no real build was run here).
2. Confirm `updateServiceWorker(reloadPage)` behaviour and that `onNeedReload` fully suppresses the auto reload (source reading only).
3. Inspect built `sw.js`: no runtime routes, denylist present, workbox chunk filename hashed.
4. Real-device iOS 26.x test: update pickup after resume, theme-color/status bar (WebKit bug 305546), persisted storage.
5. Safari 27 release notes for web app/service worker changes (not retrievable).
6. Assets-generator 2.0.0 CLI/config parity with the 1.x docs.

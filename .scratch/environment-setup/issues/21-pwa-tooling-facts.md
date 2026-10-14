# Research: PWA tooling facts
Type: research
Status: resolved
Blocked by: none

## Question

Facts the PWA tooling and updates ticket waits on, as of 2026-10-14:
1. `vite-plugin-pwa` current version and Vite 8.3.4 compatibility; alternatives if it lags. `generateSW` vs `injectManifest`, and which suits an online-first shell-only cache.
2. The update flow API (`registerType: 'prompt'`, `virtual:pwa-register` for React) and how to detect and apply an update safely without losing in-progress edits.
3. iOS/iPadOS Safari installed-PWA behaviour: service worker update checks, storage eviction, install instructions, status-bar and `theme-color` handling; Android Chrome `beforeinstallprompt`.
4. Icon/asset generation (`@vite-pwa/assets-generator` or similar) from one SVG: required sizes incl. maskable and apple-touch-icon.
5. Interaction between a service worker and the Hono-served `index.html` / `sw.js` cache headers, and ensuring `/api/*` (including POST reads) is never cached.
6. Manifest requirements for installability on Chrome, Edge, Safari 2026.

## Answer

Findings are on branch `research/pwa-tooling-facts` (commit 3262e51), file `.scratch/environment-setup/research/21-pwa-tooling-facts.md`. Claims are tagged [P] primary, [P-src] read from npm package source, [I] inference, [U] unverified. Agent output; not yet reviewed by the user.

- **`vite-plugin-pwa` 2.0.0** (2026-10-03); peer range includes Vite ^8 (since 1.3.0); needs Node >=20.19. No alternative needed; no real build was run, so do one smoke build.
- **Use `generateSW`** with `registerType: 'prompt'`, no `runtimeCaching`, and `navigateFallbackDenylist: [/^\/api\//]`. `injectManifest` only pays off with custom service-worker logic.
- **Update flow:** the docs lag the code. The 2.0.0 source ignores `updateServiceWorker`'s `reloadPage` argument; the reload happens on the `controlling` event unless `onNeedReload` is passed, so use `onNeedReload` to save drafts before reloading.
- **iOS:** iOS 26 makes every Home Screen site an installed web app. Home Screen apps have their own 7-day-eviction counter. `beforeinstallprompt` does not exist on iOS. WebKit bug 305546 (open) says `theme-color` has no effect in Safari 26.2, so test the status bar on a real device. No primary source on iOS service-worker update timing; test the update flow on a real device. Safari 27 release notes could not be retrieved.
- **Icons:** `@vite-pwa/assets-generator` 2.0.0 (ESM-only, Node >=20.19). Pass `--preset minimal-2023` explicitly (the CLI default `minimal` is deprecated). Output: 64/192/512 transparent, 512 maskable, 180 apple-touch, `favicon.ico`.
- **Headers:** Hono's `serveStatic` sets no `Cache-Control` or ETag, so set them explicitly: `no-cache` for `index.html`, `sw.js` and the manifest; `immutable` for `/assets/*`. The Cache API rejects non-GET requests, so POST reads are never cached by it. Manifest needs name, 192 and 512 icons, `start_url` and `display`. A service worker is not required for installability.

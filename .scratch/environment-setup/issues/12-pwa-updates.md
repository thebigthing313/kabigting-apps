# Grill: PWA tooling and update strategy
Type: grilling
Status: resolved
Blocked by: 01

## Question

Decide PWA tooling (vite-plugin-pwa), manifest/icons, what the service worker caches (online-first), and how users receive app updates.

## Interim decisions (user-confirmed; ticket stays claimed until research 21 lands and the tooling is chosen)

- **Identity:** name "Kabigting Apps", short name "Kabigting". No logo exists: generate a simple "K" monogram on an Olive background from one SVG, and produce every required size (including maskable and Apple touch icons) from that single source. Replace whenever a real logo exists. Theme colours come from the Olive theme, one for light and one for dark.
- **Caching (online-first):** the service worker precaches the built app shell only (`index.html`, hashed JS/CSS, fonts, icons). It never caches `/api/*`, including POST reads and all authenticated data. Offline, the app opens and shows a clear "You're offline" screen; no cached data, no queued writes.
- **Updates:** prompt, not auto-update. A new version installs in the background and a toast says "Update available — Reload"; nothing reloads under the user. The app checks on launch, on returning to the foreground, and about hourly. The server adds an `X-App-Version` (build ID) header; if the client sees a newer version in any response it shows the same toast. The toast stays until dismissed or applied. No request is rejected for being old (expand-then-contract migrations keep old clients working).
- **Install experience (in the skeleton):** an "Install app" item in the Shell menu. On Chrome and Edge it triggers the install prompt; on iOS it opens a short how-to dialog (Share → Add to Home Screen); once installed it disappears. No first-visit nag.
- **Display:** `display: standalone`; `start_url`, `scope` and manifest `id` at `/`; orientation not locked; two `theme-color` meta tags with `prefers-color-scheme` media queries; iPhone status bar blends with the page; safe-area insets honoured.
- **Shared-device privacy:** Hono sends `Cache-Control: no-store` on every `/api/*` response. The service worker holds only public build assets, so sign-out does not need to unregister it, and the installed shell shows only the sign-in screen until authenticated.
- **Development:** the service worker is off under `vite dev`; it runs only in the production build, which the end-to-end tests exercise.
- **Out of scope:** push notifications, background and periodic sync, offline writes and cached data, and Play Store / App Store listings.
- **Still open (research 21):** `vite-plugin-pwa` version and Vite 8 compatibility (or alternative), `generateSW` vs `injectManifest`, the exact update API, iOS update behaviour, and the icon generation tool.

## Answer

The interim decisions above stand, plus the tooling chosen from research 21 (the user had already accepted `vite-plugin-pwa` in the stack gaps list):

- **Tooling:** `vite-plugin-pwa` 2.0.0 with `generateSW`, `registerType: 'prompt'`, no `runtimeCaching`, and `navigateFallbackDenylist: [/^\/api\//]`. Use `onNeedReload` to save in-progress drafts before the reload (the 2.0.0 source ignores `updateServiceWorker`'s `reloadPage` argument).
- **Icons:** `@vite-pwa/assets-generator` 2.0.0 with `--preset minimal-2023` (the CLI default is deprecated), from one SVG "K" on Olive.
- **Headers (Hono):** `no-cache` for `index.html`, `sw.js` and the manifest; `immutable` for `/assets/*`; `no-store` for `/api/*`. `serveStatic` sets none of these itself.
- **iOS:** no `beforeinstallprompt`, so the Install item shows the Share → Add to Home Screen steps; Home Screen apps have a 7-day eviction counter (irrelevant for an online-first shell). Test the status bar (`theme-color` bug 305546) and the update flow on a real iPhone.
- **Scaffold-time checks:** one real `vite build` with the plugin on Vite 8.3.4; a Chromium-only Playwright test for service-worker registration and the update toast (WebKit cannot drive service-worker APIs); a manifest installability check.

# Running the Shell on an always-on Android tablet

Research for issue #102. The question: how should an Android tablet in the nursery run the Shell
PWA so the Baby App is one tap away at any hour? That breaks into three parts: full-screen install
and pinning, keeping the screen awake and dim at night, and whether the session would sign the
tablet out.

Code references are to `develop` at `7bc4e24`, with `better-auth` 1.7.7 as pinned in
`package.json`.

## Answer in brief

1. **Install and pin.** Install the Shell from Chrome as it is (`display: "standalone"`), open
   the Baby App, and use Android **App pinning** with "ask for PIN before unpinning". Real kiosk
   lock task mode needs a device policy controller (DPC) and is overkill for a household tablet.
   Leave the shared manifest alone: switching it to `fullscreen` would change every Android
   install, phones included.
2. **Stay awake.** Chrome on Android has had the Screen Wake Lock API since Chrome 84. The Baby
   App should hold a `screen` lock while it is visible and take it again on `visibilitychange`.
   A web page cannot set the screen's brightness, so night dimming has to happen in the page: a
   dark night theme or a black overlay, chosen by the hour in `America/New_York`. Lower the
   tablet's own brightness setting as well.
3. **Session.** The Shell's sessions are meant to slide (30 days, refreshed daily), but **they
   do not slide in the browser today.** The server extends the database row and then drops the
   refreshed cookie, so the cookie still expires 30 days after sign-in. **The tablet, and every
   other device, gets signed out about 30 days after signing in, however much it is used.**
   The fix is small and safe: forward Better Auth's refreshed `Set-Cookie` from the
   `loadSession` middleware. I tested it locally. Pair it with a dedicated Guest Account for
   the tablet that has App access to the Baby App only.

## 1. Full-screen install and pinning on stock Android

### Display mode

- The manifest's `display` member offers `fullscreen`, `standalone`, `minimal-ui` and
  `browser`. `fullscreen` "opens the app with browser UI elements hidden and uses the entirety of
  the available display area". `standalone` drops the URL bar "but can still include other UI
  elements such as the status bar". An unsupported mode falls back along
  `fullscreen` → `standalone` → `minimal-ui` → `browser`.
  ([MDN: display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display))
- Per web.dev, `fullscreen` is "currently only available on Android devices, and it hides the
  status bar and the navigation bar". `display_override` sets a custom fallback chain that is
  tried "before evaluating the `display` member".
  ([web.dev: App design](https://web.dev/learn/pwa/app-design))
- Chrome has supported `display`, including `fullscreen`, since Chrome 39, and Chrome for Android
  matches it. ([MDN browser-compat-data `manifests/webapp/display`](https://github.com/mdn/browser-compat-data/blob/main/manifests/webapp/display.json))
- **In this repo:** `vite.config.ts` sets `display: "standalone"` on the Shell's single
  manifest. The manifest belongs to the Shell, not to an App, so `fullscreen` or a
  `display_override` would affect phones too.

**Recommendation:** keep `standalone`. The visible status bar is useful in a nursery because it
shows the clock and the battery. If the navigation bar ever matters, the Baby App could offer a
"go full screen" button that calls the Fullscreen API. That API needs a user gesture each time
the app starts, so it is optional.

### Pinning and kiosk options

- **App pinning** (user-level and stock on every Android device): Settings → Security (or
  Security & location) → Advanced → App pinning. Then open the app, go to Overview, tap the
  app's icon and choose **Pin**. To unpin, touch and hold Back and Overview, or swipe up and
  hold with gesture navigation. "When app pinning is on, you need to enter your PIN, pattern, or
  password before you can unpin." Menu names vary by manufacturer.
  ([Android Help: Pin & unpin screens](https://support.google.com/android/answer/9455138))
- **Lock task mode** is the real kiosk mode. A DPC has to allowlist the app, on a fully managed
  device or a managed secondary user. Android's docs contrast it with pinning: screen pinning
  "appears similar ... but the person using the device can exit the mode whenever they want."
  ([Android Developers: Lock task mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode))
  Setting that up means factory-resetting the tablet and enrolling it in device management.
  That is too much for this household.

**Recommendation:** use App pinning with a PIN required to unpin. It stops a curious toddler or
a stray tap from leaving the Baby App. An adult can still unpin it on purpose, and here that is
what we want.

## 2. Keeping the screen awake, and dimming at night

### Screen Wake Lock API

- `navigator.wakeLock.request("screen")` returns a `WakeLockSentinel` that keeps the screen
  from dimming or locking. It works only in a secure context (HTTPS). The lock is released
  when the document is no longer visible, by `release()`, or by the system, for example on low
  battery. A request can be refused in power save mode. MDN's pattern is to request the lock
  again on `visibilitychange` when `document.visibilityState === "visible"`.
  ([MDN: Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API))
- Shipped in Chrome 84, and Chrome for Android has the same version
  ([Chrome for Developers: Wake Lock](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock);
  [MDN browser-compat-data `api/WakeLock`](https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json)).
  It became Baseline in March 2025 once the other engines caught up.
- An installed, pinned PWA stays the visible document, so the lock holds until something
  releases it. Two things can still let the screen turn off: power save mode refusing the
  request, and someone pressing the power button. Keep the tablet on its charger with battery
  saver off.
- The Android `Stay awake` developer option ("Sets your screen to stay on while the device is plugged in") is a
  fallback that needs no code
  ([Android Developers: Developer options](https://developer.android.com/studio/debug/dev-options)).
  It is a device-wide setting, so the wake lock is the better default and this is the backup.

**Why not let the screen sleep at night?** With a PIN set (which App pinning's unpin PIN
requires), a sleeping screen wakes to the lock screen, and that ends one-tap logging. The screen
should stay on and get darker instead.

### Night dimming

- No web API sets the screen's backlight. The Wake Lock API only keeps the screen on.
- So dimming has to be done in the page:
  - **Night mode by clock:** between bedtime and morning in `America/New_York` (take the hour
    from `src/shared/dates.ts`, the only place allowed to use `date-fns`), switch the Baby App
    to a near-black theme with dim, warm text. Alternatively, lay a black overlay at about 70-85%
    opacity over the page that clears for a minute after a tap. Either way the buttons stay big
    enough to hit half-asleep.
  - **Device settings:** turn down the brightness slider, turn off adaptive brightness so a dark
    room cannot push it up, and if the tablet has them, use Night Light or Extra dim on a
    schedule. Those are system features under the user's control, outside the PWA.
- If the screen ever needs to go fully dark, the Baby App could `release()` its wake lock in a
  set window and let the system timeout turn it off. Given the lock-screen problem above, that
  only suits a tablet with no screen lock, so it is not recommended.

## 3. Would the session sign the tablet out?

### What the code configures

`src/server/auth/auth.ts` sets up Better Auth with:

```ts
session: {
  modelName: "auth_session",
  expiresIn: THIRTY_DAYS, // 60 * 60 * 24 * 30
  updateAge: ONE_DAY,     // 60 * 60 * 24
  cookieCache: { enabled: false },
},
```

In Better Auth 1.7.7 (`dist/api/routes/session.mjs`), `get-session` refreshes a session once it
is more than `updateAge` old:
`shouldBeUpdated = expiresAt - expiresIn + updateAge <= now`. The refresh sets
`expiresAt = now + expiresIn` in the database **and** calls `setSessionCookie(..., { maxAge })`,
which re-issues the `session_token` cookie with `Max-Age=2592000` (30 days). Sign-in does not
pass `rememberMe: false` (`src/client/routes/sign-in.tsx`), so the cookie is persistent. The
design intent is therefore "signed out only after 30 days without use", which would be fine for
a tablet used every day.

### The gap: the refreshed cookie never reaches the browser

`src/server/app.ts` mounts `loadSession(auth)` on `/api/*` **before** the Better Auth handler on
`/api/auth/*`. `loadSession` (`src/server/core/session.ts`) calls
`auth.api.getSession({ headers })` server-side and keeps only the session object. So:

1. On any API request (including the client's own `GET /api/auth/get-session`) from a session
   older than a day, `loadSession`'s server-side call runs the refresh. The database row is
   extended, and the `Set-Cookie` that Better Auth produced is thrown away.
2. On `/api/auth/get-session`, the Better Auth handler then reads the just-updated row,
   finds `shouldBeUpdated` false, and sends **no** `Set-Cookie`.

The browser's `session_token` cookie keeps the `Max-Age` from sign-in (or from the last
password change) and expires 30 days later, even though the database row is still valid. The
client's `fetchSession()` in `_app`'s `beforeLoad` then gets `null` and redirects to
`/sign-in`.

**Verified locally** with a throwaway integration test (not committed). I signed in, aged the
session row by two days, and sent `GET /api/auth/get-session` through `createApp`:

- Through the app: status 200, `expires_at` moved forward 30 days, **`Set-Cookie`: none**.
- Same request straight to `auth.handler`: `Set-Cookie: better-auth.session_token=...;
Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`.

This affects every device, not only the tablet. Everyone is signed out about 30 days after
their last sign-in or password change, however active they are.

### Other things that sign the tablet out (all by design)

- **Password change on the same Account.** `rejectReusedPassword` forces
  `revokeOtherSessions: true` on every change-password request. If the tablet shared a
  parent's Account, the parent changing their password would sign out the tablet.
- **Admin actions.** Resetting the Account's password or removing it calls
  `deleteUserSessions` (`src/server/auth/accounts.ts`).
- **30 days with no requests at all**, e.g. the tablet is switched off for a month. That is the
  intended idle expiry.
- Clearing Chrome's site data on the tablet.

### Recommended change

1. **Forward the refreshed cookie from `loadSession`.** Ask Better Auth for its headers and
   append any `Set-Cookie` to the response after the route has run:

   ```ts
   export function loadSession(auth: AuthServer) {
     return createMiddleware<AppEnv>(async (c, next) => {
       let refreshed: string[] = []
       if (c.get("session") === undefined) {
         const { headers, response } = await auth.api.getSession({
           headers: c.req.raw.headers,
           returnHeaders: true,
         })
         refreshed = headers.getSetCookie()
         c.set("session", response)
       }
       await next()
       for (const cookie of refreshed) c.res.headers.append("Set-Cookie", cookie)
     })
   }
   ```

   I tried this locally: the probe above then got the 30-day `Set-Cookie` through the app, and
   `tsc` for the server passed. Setting the header with `c.header(..., { append: true })`
   _before_ `next()` did **not** work on `/api/auth/*`, because the raw `Response` returned by
   `auth.handler` replaced it. Points to settle when building it:
   - Skip appending when the route's response already sets the session cookie (sign-out,
     change-password), so a refresh cookie never overwrites a deletion or a newer token.
   - `AuthServer` in `src/server/core/context.ts` narrows `api` to a `Pick`, so its type has
     to allow `returnHeaders`.
   - Add an integration test: an aged session gets a `Set-Cookie` with `Max-Age=2592000` on
     both `/api/auth/get-session` and an App route.

   This keeps the current security policy (a 30-day idle expiry, revocation by the Admin) and
   only makes it behave as configured. It does not lengthen `expiresIn` or turn off expiry.
   With it in place, a tablet that makes any request each day stays signed in indefinitely.

2. **Give the tablet its own Guest Account** with App access to the Baby App only. If the
   tablet is lost or someone wanders off with it, it exposes baby logs and nothing else
   (Finances stays hidden). A parent's password change no longer signs it out, and the Admin can
   sign out just the tablet by resetting or removing that Account.
3. **Optionally**, have the Baby App run a cheap `fetchSession()` on `visibilitychange` or once
   an hour. Today the tablet only checks the session when a route loads. A light ping makes
   sure an idle tablet still sends at least one request a day (which refreshes the session
   once change 1 is in) and notices a sign-out before someone taps.

Not recommended: a much longer `expiresIn` (such as a year) or "never expire". Either one
widens the window for a stolen cookie on every device, and once the refresh works, neither is
needed.

## Sources

- MDN, [`display` manifest member](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display)
- web.dev, [Learn PWA: App design](https://web.dev/learn/pwa/app-design)
- MDN, [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- Chrome for Developers, [Stay awake with the Screen Wake Lock API](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock)
- MDN browser-compat-data, [`api/WakeLock.json`](https://github.com/mdn/browser-compat-data/blob/main/api/WakeLock.json) and [`manifests/webapp/display.json`](https://github.com/mdn/browser-compat-data/blob/main/manifests/webapp/display.json)
- Android Help, [Pin & unpin screens](https://support.google.com/android/answer/9455138)
- Android Developers, [Lock task mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode)
- Android Developers, [Configure on-device developer options](https://developer.android.com/studio/debug/dev-options)
- Repo: `src/server/auth/auth.ts`, `src/server/core/session.ts`, `src/server/app.ts`,
  `src/server/auth/accounts.ts`, `src/client/data/session.ts`, `src/client/routes/_app.tsx`,
  `src/client/routes/sign-in.tsx`, `vite.config.ts`
- Better Auth 1.7.7 package source: `dist/api/routes/session.mjs`, `dist/cookies/index.mjs`,
  `dist/api/dispatch.mjs`

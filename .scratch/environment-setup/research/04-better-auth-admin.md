# Research: Better Auth admin-provisioned accounts

Ticket: [04-better-auth-admin](../issues/04-better-auth-admin.md). Researched 2026-10-14 against `better-auth@1.7.7` (npm `latest`, published 2026-09-30) and `@better-auth/drizzle-adapter@1.7.7`. Source links for code point at the `v1.7.7` tag.

## Answer in brief

1. **Invite-only is two lines of config.** `emailAndPassword: { enabled: true, disableSignUp: true }`. The check lives only in the `/sign-up/email` route, so the admin plugin's `createUser` is unaffected.
2. **Admin creates Accounts with the admin plugin.** `auth.api.createUser` / `authClient.admin.createUser({ email, password, name, role?, data? })` creates the user, lowercases the email, and links a `credential` account with the hashed temporary password. Bootstrap the first Admin with `npx auth@latest create-admin`.
3. **Forced password change at first sign-in is NOT built in.** It is an open feature request (issue #2324, open since 2025-04, still receiving "any update?" on 2026-09-27). We must build it: a `mustChangePassword` user field, a Hono guard that returns 403 until it clears, and an after-hook on `/change-password` that clears it. Design below.
4. **Password reset without email: Admin runs `setUserPassword` and re-sets the flag.** `requestPasswordReset` throws `RESET_PASSWORD_DISABLED` when `sendResetPassword` is not configured, so the self-service path is off by default. The email sender stays deferred (map "Transactional email").
5. **Per-App access for friends:** simplest fit is a small app-owned `app_access(user_id, app_key)` table checked in Hono middleware. The admin plugin's access control and the organization plugin are real alternatives; the first is a poor fit, the second is overkill. See below.

## 1. Invite-only (signup disabled)

- `emailAndPassword.disableSignUp` blocks email/password sign-up (default `false`). Source: [Options reference](https://www.better-auth.com/docs/reference/options).
- Enforcement is in the sign-up route and returns `EMAIL_PASSWORD_SIGN_UP_DISABLED`: [`api/routes/sign-up.ts`](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/api/routes/sign-up.ts) (`!emailAndPassword.enabled || emailAndPassword.disableSignUp`).
- No social/other providers are configured, so there is no other signup door. If one is added later, set its own `disableSignUp` (v1.7.7 fixed ID-token sign-in ignoring a provider's `disableSignUp`: [releases](https://github.com/better-auth/better-auth/releases)).

## 2. Admin plugin: creating Accounts

Setup per [Admin plugin docs](https://www.better-auth.com/docs/plugins/admin): `plugins: [admin()]` on the server, `adminClient()` on the client, then `npx auth generate` / `migrate`.

- **Schema added:** `user.role`, `user.banned` (default false), `user.banReason`, `user.banExpires`; `session.impersonatedBy`. Source: [`admin/schema.ts`](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/plugins/admin/schema.ts).
- **Who is an admin:** a user with role in `adminRoles` (default `["admin"]`) or whose id is in `adminUserIds`. Docs: Admin plugin page.
- **First Admin:** `npx auth@latest create-admin --email <email> --name <name> --role admin` (email marked verified by default; `--force`/`--yes` skip the existing-users prompt). Docs: Admin plugin page. Use this as the seed step instead of a bespoke script.
- **`createUser`** (`POST /admin/create-user`): required `email`, `password`, `name`; optional `role`, `data`. Per [`admin/routes.ts`](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/plugins/admin/routes.ts):
  - HTTP calls need a session with the `user:create` permission; setting a role also needs `user:set-role`.
  - **A server-side call with no headers/request skips all permission checks.** Fine for seed scripts; never expose it on a route without your own auth check.
  - Email is lowercased, validated, and duplicate-checked.
  - Password is hashed with the context hasher (default scrypt) and stored on a `credential` account.
  - `data` is spread into the user row; the route does not call `parseUserInput`, so `input: false` additional fields appear not to be filtered here. Treat as an implementation detail and cover it with a test in the skeleton (see Risks).
  - `emailVerified` is not set. Pass `data: { emailVerified: true }` if anything gates on it (nothing does with email verification off).
- **`setUserPassword`** (`POST /admin/set-user-password`): needs `user:set-password`; creates a credential account if none exists; **does not revoke the user's sessions** (verified in `routes.ts`).
- **Other useful endpoints:** `listUsers` (search/filter/paging), `getUser`, `updateUser`, `banUser` (blocks sign-in and revokes sessions), `removeUser`, `listUserSessions`, `revokeUserSessions`, `impersonateUser`.
- **Temporary password policy:** `minPasswordLength` 8, `maxPasswordLength` 128 by default ([options](https://www.better-auth.com/docs/reference/options)). v1.7.6 rejects over-long passwords with `PASSWORD_TOO_LONG` before hashing. Generate temporary passwords in the Admin UI (random, high entropy) and show once.

## 3. Forced password change at first sign-in (must be built)

**Status:** not provided by Better Auth. Feature request [#2324](https://github.com/better-auth/better-auth/issues/2324) is open; maintainers worried about a permanent boolean column or an extra table; community proposals include a Two-Factor-style cookie redirect and a `password_updated_at` column; one commenter shared a custom plugin. Nothing has shipped as of 2026-10-14. The admin docs mention no such option.

**Recommended design (smallest thing that works, enforced server-side):**

1. Add a user field via [`user.additionalFields`](https://www.better-auth.com/docs/concepts/database) (fields support `type`, `required`, `defaultValue`, `input`, `returned`):
   `mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false }`.
   `defaultValue` is JS-layer only (per the docs), so set it explicitly: `createUser({ ..., data: { mustChangePassword: true } })`. The `create-admin` CLI user keeps `false` (or change it on first login by hand).
2. Sessions return the user object, so `session.user.mustChangePassword` is available to the client and to Hono's `auth.api.getSession`.
3. **Enforcement in Hono, not just the client.** Session middleware (pattern from the [Hono integration doc](https://www.better-auth.com/docs/integrations/hono): `auth.api.getSession({ headers: c.req.raw.headers })`, `c.set("session", ...)`) returns 403 `PASSWORD_CHANGE_REQUIRED` for every `/api/*` route except an allowlist: `/api/auth/get-session`, `/api/auth/change-password`, `/api/auth/sign-out`. The SPA reads the same flag and routes to a "set your password" screen.
4. **Clearing the flag:** use an [after hook](https://www.better-auth.com/docs/concepts/hooks) (`createAuthMiddleware`, branch on `ctx.path === "/change-password"`, `ctx.context.newSession` is only available in after hooks) that, on success, sets `mustChangePassword = false` via the internal adapter. Alternative: expose our own Hono route that calls `auth.api.changePassword` then updates the user, and keep the allowlist to that one route.
5. `changePassword({ newPassword, currentPassword, revokeOtherSessions: true })` ([email-password docs](https://www.better-auth.com/docs/authentication/email-password)) requires the current (temporary) password, which suits the flow. Pass `revokeOtherSessions: true`.
6. Reject reuse of the temporary password in the same hook (new != current) if desired.

**Cookie cache caveat.** If `session.cookieCache` is enabled, the signed `session_data` cookie can serve a stale user (flag still true after change) until `maxAge` expires ([session management](https://www.better-auth.com/docs/concepts/session-management)). `cookieCache` defaults to `false`; keep it off for the skeleton (one Postgres, one user group), or pass `disableCookieCache: true` on the guard.

**Alternative considered:** a `password_updated_at` timestamp plus compare with `createdAt`. Gives expiry policy later, but costs more logic for no current need. Rejected for now.

## 4. Password reset without email

- Self-service `requestPasswordReset` needs `emailAndPassword.sendResetPassword`; without it the route throws `RESET_PASSWORD_DISABLED` ([`routes/password.ts`](https://github.com/better-auth/better-auth/blob/v1.7.7/packages/better-auth/src/api/routes/password.ts)). So omitting it cleanly disables self-service reset.
- **Admin-driven reset:** Admin UI calls `admin.setUserPassword({ userId, newPassword })` with a fresh temporary password, then `admin.updateUser`/an internal endpoint to set `mustChangePassword = true`, then `admin.revokeUserSessions({ userId })` because `setUserPassword` leaves sessions alive. Wrap those three steps in one Hono admin route so they cannot be done half-way.
- If email is added later (map: "Transactional email"), set `sendResetPassword`, `revokeSessionsOnPasswordReset: true` (default false), and `resetPasswordTokenExpiresIn` (default 3600 s) ([options](https://www.better-auth.com/docs/reference/options)).
- Lockout: there is no recovery for the Admin themselves except the CLI/DB. Keep a documented break-glass: run a script calling `auth.api.setUserPassword` server-side (no headers = no permission check) against the production DB.

## 5. Drizzle adapter

- As of 1.7.x the adapter is its own package: `import { drizzleAdapter } from "@better-auth/drizzle-adapter"` ([Drizzle adapter docs](https://www.better-auth.com/docs/adapters/drizzle), [package source](https://github.com/better-auth/better-auth/tree/v1.7.7/packages/drizzle-adapter)). Install `@better-auth/drizzle-adapter` alongside `better-auth`. Peer deps: `drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0`, `@better-auth/core ^1.7.7` ([npm](https://www.npmjs.com/package/@better-auth/drizzle-adapter)). drizzle-orm latest stable is 0.45.4 (checked via npm on 2026-10-14); defer the ORM choice to its own ticket.
- Config: `drizzleAdapter(db, { provider: "pg", schema?, usePlural?, schemaName? })`. Pass `schema` when table names differ from model names; `usePlural: true` for plural tables.
- Workflow: `npx auth@latest generate` emits the Drizzle schema for the auth tables (including admin plugin and `additionalFields` columns), then normal `drizzle-kit generate` / `drizzle-kit migrate`. Re-run `generate` whenever plugins or additional fields change. Do not run `auth migrate` (it bypasses drizzle-kit history).
- The docs page does not discuss Postgres drivers; the adapter takes whatever Drizzle `db` instance is passed (driver choice belongs to the ORM ticket).

## 6. Hono integration and session cookies

- Mount: `app.all("/api/auth/*", (c) => auth.handler(c.req.raw))`, matching `basePath` (default `/api/auth`), registered before any catch-all/SPA fallback. Source: [Hono integration](https://www.better-auth.com/docs/integrations/hono).
- **CORS is unnecessary** in our setup: Hono serves SPA and API from one origin, and Vite dev proxies `/api`, so the browser sees one origin in both modes. (The doc's CORS recipe applies only to separate origins.) Set `baseURL` / `BETTER_AUTH_URL` to the Railway domain; `trustedOrigins` defaults to the `baseURL` origin ([options](https://www.better-auth.com/docs/reference/options)). Do not rely on request inference.
- Session type for Hono: `Variables: { session: typeof auth.$Infer.Session | null }` and the `createMiddleware<Env>` pattern from the same doc.
- **Cookies** ([cookies concept](https://www.better-auth.com/docs/concepts/cookies)): `better-auth.session_token` is the session cookie (opaque, signed); `session_data` exists only with cookie cache; `dont_remember` only when `rememberMe` is false. All cookies are `httpOnly`, and `secure` in production. Prefix changeable via `advanced.cookiePrefix`; `advanced.useSecureCookies` forces Secure. The docs do not state a default `sameSite`; verify in the skeleton's browser test (same-origin makes either value work). Railway terminates TLS, so confirm the server sees `https` or set `useSecureCookies: true` (risk below).
- Sessions: `expiresIn` 7 days, `updateAge` 1 day, `freshAge` 1 day ([session management](https://www.better-auth.com/docs/concepts/session-management)). Reasonable for a family PWA; consider longer `expiresIn` so an installed PWA stays signed in.
- `BETTER_AUTH_SECRET` is mandatory in production (missing secret throws). Rate limiting is on in production, in-memory by default (`window` 10 s, `max` 100); fine for one instance, and a Postgres-backed store is available (v1.7.7 fixed a PostgreSQL rate-limit concurrency bug).
- Static + SPA fallback in Hono Node: `serveStatic` from `@hono/node-server/serve-static`; `root` resolves relative to `process.cwd()` ([Hono Node docs](https://hono.dev/docs/getting-started/nodejs)). Register the Better Auth mount and `/api/*` routes before the static fallback. The docs do not show an SPA fallback recipe; implement `index.html` fallback explicitly and test deep links.

## 7. Extending to per-App access for friends

Three options, from the primary docs:

| Option | Fit | Notes |
|---|---|---|
| **App-owned `app_access(user_id, app_key)` table + Hono middleware** | **Recommended** | One table, one middleware per App route subtree (`requireApp("finances")`). Admin UI grants/revokes. Family Accounts get all Apps; a friend gets a row per shared App. No Better Auth schema coupling. Cost: we write the check. |
| Admin plugin access control (`createAccessControl`, custom roles) | Poor | Roles are global and stored as a string on `user.role`; they model what an Account may do to users/sessions (statements like `user: [...]`), so per-App roles like `finances-viewer` would work but multiply roles per combination and mix concerns. Docs: [Admin plugin](https://www.better-auth.com/docs/plugins/admin) (custom statements, `ac.newRole`, `hasPermission`). Note custom roles replace default admin permissions unless `adminAc.statements` is spread. |
| Organization plugin | Overkill | Orgs/members/teams/invitations, with invitations assuming `sendInvitationEmail`; `addMember` works server-side without email. Gives tenancy, which `CONTEXT.md`/map excludes (no household, no multi-tenancy). [Docs](https://www.better-auth.com/docs/plugins/organization). |

Within Apps, per-record sharing (e.g. a friend sees only one ledger) is a separate data-model question and belongs to the Friend-sharing ticket; the table above only gates App entry. Keep `role` for Admin vs Account only.

## Proposed config sketch (for the scaffold spec)

```ts
betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true, disableSignUp: true /* no sendResetPassword */ },
  user: { additionalFields: { mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false } } },
  plugins: [admin()],
  hooks: { after: /* on /change-password success: clear mustChangePassword */ },
})
```

## Risks and open points to verify in the skeleton

- `createUser({ data: { mustChangePassword: true } })` honouring an `input: false` field: the route code shows no filtering, but add an integration test so a future change cannot silently leave new Accounts unflagged. Fallback: set the flag by a `databaseHooks.user.create` hook (syntax not covered by the hooks docs page; read the options reference before relying on it) or a follow-up `updateUser`.
- Guard allowlist must include only get-session, change-password, sign-out; test that other `/api/*` routes and `/api/auth/admin/*` return 403 while flagged.
- Cookie `Secure`/`sameSite` behind Railway's proxy: verify sign-in works on the generated domain and in the installed PWA.
- `setUserPassword` does not revoke sessions; the reset route must revoke explicitly.
- Better Auth ships frequently (about weekly in 2026-09); pin exact versions and re-check #2324 when scaffolding in case a native option lands.

## Sources

- Admin plugin: https://www.better-auth.com/docs/plugins/admin
- Email and password: https://www.better-auth.com/docs/authentication/email-password
- Options reference: https://www.better-auth.com/docs/reference/options
- Hono integration: https://www.better-auth.com/docs/integrations/hono
- Drizzle adapter: https://www.better-auth.com/docs/adapters/drizzle
- Cookies / Session management / Hooks / Database (additional fields): https://www.better-auth.com/docs/concepts/cookies , /session-management , /hooks , /database
- Organization plugin: https://www.better-auth.com/docs/plugins/organization
- Source at v1.7.7: https://github.com/better-auth/better-auth/tree/v1.7.7
- Issue #2324 (force password change): https://github.com/better-auth/better-auth/issues/2324
- Releases: https://github.com/better-auth/better-auth/releases
- Hono on Node: https://hono.dev/docs/getting-started/nodejs

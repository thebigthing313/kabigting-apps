# Research: Better Auth admin-provisioned accounts
Type: research
Status: resolved
Blocked by: none

## Question

How do we make Better Auth invite-only (signup disabled), have an admin create Accounts by email with a temporary password, and force a password change at first sign-in? Cover the admin plugin, Drizzle adapter, Hono integration and session cookies, password reset without email, and what extending to per-App access for friends would take.

## Answer

Findings are on branch `research/better-auth-admin` (commit 333a9a2), file `.scratch/environment-setup/research/04-better-auth-admin.md`. Agent output, checked by the agent against better-auth 1.7.7; not yet reviewed by the user.

- Invite-only: `emailAndPassword.disableSignUp: true` blocks only `/sign-up/email`, so the admin plugin's `createUser` still works (it hashes the temporary password). Seed the first Admin with `npx auth@latest create-admin`.
- Forced password change is not built in (upstream issue #2324 is open). Build it with a `mustChangePassword` additional field (`input: false`), a Hono guard that returns 403 on everything except get-session, change-password and sign-out, and an after-hook on `/change-password` that clears the flag. Keep `cookieCache` off so a stale flag is never served.
- Reset without email: omit `sendResetPassword`. The Admin calls `setUserPassword`, sets the flag again, then `revokeUserSessions`.
- The Drizzle adapter is a separate package, `@better-auth/drizzle-adapter` (needs drizzle-orm ^0.45.2 or 1.0 RC). Mount `auth.handler` at `/api/auth/*`; no CORS needed on a single origin. Set `baseURL` and `BETTER_AUTH_SECRET` explicitly.
- Friend access to Apps: an app-owned `app_access(user_id, app_key)` table plus a Hono `requireApp` middleware; the admin-plugin roles and the organization plugin fit worse.
- Open risks for the build to verify: whether `createUser`'s `data` filters `input: false` fields (read from source, not tested), cookie `sameSite`/`Secure` behind Railway's proxy, and the Hono SPA fallback.

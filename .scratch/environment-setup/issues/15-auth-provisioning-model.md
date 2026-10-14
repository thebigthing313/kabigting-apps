# Grill: Auth provisioning model
Type: grilling
Status: resolved
Blocked by: 04

## Question

Using the research findings, settle how the Admin creates Accounts, the temporary-password and forced-change flow, password reset, session settings, and whether per-App access is modeled now.

## Answer

Decided with the user (all eight recommendations accepted).

- **Creating Accounts:** script first (Admin seeded with `npx auth@latest create-admin`; further Accounts via a script using the admin plugin's `createUser`). An in-app admin screen is a later feature, out of scope for this map.
- **Temporary password:** generated randomly at creation, shown to the Admin once, passed on out-of-band. Never emailed. The Account starts with `mustChangePassword = true`.
- **Forced change:** `mustChangePassword` additional field (`input: false`), a Hono guard returning 403 on everything except get-session, change-password and sign-out, and an after-hook on `/change-password` that clears the flag. `cookieCache` stays off. Rules: minimum 12 characters, no composition rules, must differ from the temporary password. Breached-password check is a later hardening step.
- **Reset and verification:** no email sender. `sendResetPassword` omitted, so self-service reset is disabled. The Admin resets via `setUserPassword`, sets the flag again and revokes sessions. No email verification; the Admin vouches for each address.
- **Sessions:** 30 days, refreshed on use, `cookieCache` off; a password change revokes the other sessions.
- **Roles:** `admin` and `user` only. The Admin is seeded by script; no one becomes Admin through the UI.
- **Per-App access:** built in the skeleton, default-deny. App-owned `app_access(user_id, app_key)` table plus a Hono `requireApp` middleware checked on every App route and API route; the Admin grants access per Account and App. Family Accounts get Finances through the same table. Accounts limited to specific Apps are called **Guests**.
- **Lifecycle and hardening:** removal is ban plus revoke sessions (no hard delete); Better Auth's built-in rate limiting stays on; no 2FA or passkeys in the skeleton.

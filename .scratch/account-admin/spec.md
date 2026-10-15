# Account administration screen spec

A build agent executes this in one pass to give the **Admin** an in-app screen for managing **Accounts**: create one with a temporary password, reset its password, remove and restore it, and choose its **App access**. It replaces day-to-day use of `scripts/admin.ts`; the script stays.

Read first: `CONTEXT.md` (glossary), `AGENTS.md`, then this file. Background decisions live in `.scratch/environment-setup/issues/15-auth-provisioning-model.md`, which ruled this screen out of the skeleton; this spec brings it in. Every decision below was settled with the user on 2026-10-14 without a map (the effort fit one session). If something here cannot be done as written, stop, record the deviation and ask the user. Do not silently re-decide.

## 1. Acceptance criteria

1. Only an Account with the `admin` role sees the screen. Every `/api/admin/*` route returns 403 `forbidden_admin` for any other signed-in Account, and the client route redirects non-Admins to Home.
2. The Admin can create an Account from an email, a name and a set of Apps. The response includes a temporary password, and the Account must change it at first sign-in (existing `mustChangePassword` flow).
3. The Admin can reset an Account's password. That issues a new temporary password, sets `mustChangePassword` again and signs the Account out everywhere.
4. The temporary password stays viewable (hidden by default, with Show and Copy) on the Account's row for as long as the Account is **Awaiting password change**. It is never viewable after the Account changes its password.
5. The Admin can remove an Account (ban plus sign out everywhere, data kept) and restore a Removed Account (unban; the password is unchanged).
6. The Admin can change an Account's App access by ticking checkboxes in an edit sheet and pressing Save (one request).
7. On the screen the Admin cannot reset, remove, restore or change the Apps of their own Account. The server enforces this too.
8. `pnpm check` and `pnpm test:all` pass. There is a changeset.

## 2. Settled decisions

| # | Decision |
| --- | --- |
| D1 | The output is this spec; nothing was built while planning. |
| D2 | Gate on the `admin` role, never on an email (the repo is public). Only the CLI creates Admins (`pnpm admin:create`), so in production the one seeded Admin is the only one. |
| D3 | "Revoke access" means **remove** (ban plus revoke sessions, the existing `banAccount`). Revoking one App is a separate action: untick it. An Account with zero Apps stays signed in to an empty Shell; it is not removed automatically. **Restore** (unban) is in scope. |
| D4 | Out of scope: delivering the temporary password, hard delete, granting or revoking the `admin` role, editing email or name, an audit log, last sign-in, 2FA/passkeys. |
| D5 | No self-targeting from the screen: the Admin's own row is read-only. The CLI is the break-glass path. |
| D6 | `scripts/admin.ts` stays unchanged in behaviour. It and the API share `src/server/auth/accounts.ts`. |
| D7 | The screen belongs to the **Shell**, not an App: route `/_app/admin/accounts`. It is never an `app_access` key. |
| D8 | Own Hono routes under `/api/admin/*` behind `requireAdmin`. The client never calls Better Auth's `/api/auth/admin/*` endpoints directly. |
| D9 | The client uses plain TanStack Query in `src/client/data/admin-accounts.ts`: one list query, plus mutations that invalidate it on success. There is no TanStack DB collection, because the actions are server commands with server-generated results, not optimistic row edits. |
| D10 | The temporary password stays viewable until the Account changes it (see section 3). Plaintext storage is accepted: the user chose convenience over stricter handling, the password is short-lived, it is returned only to the Admin, and `/api/*` is already `no-store`. |
| D11 | The list shows email, name, status (**Active**, **Awaiting password change**, **Removed**) and App chips. |
| D12 | App access is edited in a sheet with one checkbox per App and a Save button that sends the full set. |
| D13 | Reset and Remove each need a confirm dialog (no typing the email). Restore and Save need no confirm. |
| D14 | App keys and titles move to `src/shared/apps.ts`; the server and client registries derive from it. |
| D15 | Testing: integration tests for every admin route (including the 403s and self-targeting refusals); one Playwright e2e covering the whole lifecycle (section 6). |

## 3. Data

New app-owned table (never a Better Auth additional field, so it is never sent in the session payload):

```
temporary_password
  user_id     text primary key references auth_user(id) on delete cascade
  password    text not null
  created_at  timestamptz not null default now()
```

Schema in `src/server/db/schema/access.ts` (or a sibling `accounts.ts` exported from `schema/index.ts`), plus a generated, committed SQL migration (forward-only).

Lifecycle (one row at most per Account):

- `createAccount` and `resetAccount` upsert the row with the new password.
- The existing `clearMustChangePassword` after-hook in `src/server/auth/auth.ts` also deletes the row. To give the hook database access, pass `db` into `options()`.
- `banAccount` (Remove) deletes the row. After a Restore, an Account that never changed its password still has `mustChangePassword` set and no viewable password; the Admin uses Reset. The UI shows **Reset to issue a new password** in place of the password field in that case.

The CLI keeps printing passwords. Because it calls the same functions, it also writes the row; that is fine.

## 4. Server

### `src/shared/apps.ts`

`APPS = [{ key: "skeleton", title: "Notes" }] as const`, `AppKey`, `APP_KEYS`, `isAppKey`. `src/server/core/apps.ts` re-exports from it (or is deleted with imports updated). `src/client/shell/apps.ts` keeps `description`, `to` and `icon` keyed by `AppKey`, so a missing App is a type error.

### `src/server/auth/accounts.ts` additions

- `restoreAccount(deps, { userId })`: `updateUser(userId, { banned: false, banReason: null, banExpires: null })`.
- `setApps(db, userId, apps)`: in one transaction, delete `app_access` rows not in `apps` and insert the missing ones. Revoking an App does not sign the Account out; `requireApp` already denies it on the next request.
- `listAccounts(db)`: each Account with `id, email, name, role, banned, mustChangePassword, apps[], temporaryPassword | null`, ordered by email.
- Change the existing functions to accept a `userId` as well as an email (the API works by id; the CLI keeps resolving email to id via `findUserId`).
- Write and clear `temporary_password` as described in section 3.

### `src/server/core/require-admin.ts`

Runs after `requireSession`; throws `ApiError("forbidden_admin", "Only the Admin can do this")` unless `account.role === "admin"`. Add `forbidden_admin: 403` to `src/shared/api-error.ts`.

### `src/server/core/admin-routes.ts`

Mounted at `/api/admin` in `apiRoutes`, with the chain `requireSession` → `mustChangePassword` → `requireAdmin`. Zod schemas live in `src/shared/schemas/admin.ts`; inputs are strict; errors use the standard envelope.

| Method and path | Body | Result |
| --- | --- | --- |
| `GET /accounts` | none | `{ rows: AdminAccount[] }` |
| `POST /accounts` | `{ email, name, apps: AppKey[] }` | `{ row }` with `temporaryPassword` set. 409 `conflict` if the email exists (check before calling `createUser`). |
| `POST /accounts/:id/reset` | none | `{ row }` |
| `POST /accounts/:id/remove` | none | `{ row }` |
| `POST /accounts/:id/restore` | none | `{ row }` |
| `PUT /accounts/:id/apps` | `{ apps: AppKey[] }` | `{ row }` |

- Every `:id` action returns 404 `not_found` for an unknown id, and 409 `conflict` with the message "You cannot change your own Account here" when `:id` is the caller.
- Email is trimmed and lowercased; name is trimmed, 1–100 characters. Unknown App keys fail validation.
- `remove` on a Removed Account and `restore` on an Active one succeed and change nothing.

## 5. Client

- `src/client/data/admin-accounts.ts`: `useAdminAccounts()` (query key `["admin", "accounts"]`), and `useCreateAccount`, `useResetAccount`, `useRemoveAccount`, `useRestoreAccount`, `useSetApps`, each invalidating the list on success and reporting errors through the existing `reportError`. `signOut` already clears the query client.
- `src/client/routes/_app/admin/accounts.tsx`: `beforeLoad` redirects to `/` unless `session.user.role === "admin"`. Add `role` to the `inferAdditionalFields` user fields in `src/client/data/session.ts` if the admin plugin's type does not already expose it.
- Shell (`src/client/shell/app-shell.tsx`): for Admins only, an **Admin** sidebar group below Apps with one item, **Accounts** (`UsersIcon`).
- Screen layout, mobile-first:
  - Header "Accounts" with a **New Account** button.
  - A TanStack Table on desktop and stacked cards below `md`: email, name, status badge, App chips, and an actions menu (Edit Apps, Reset password, Remove or Restore). The Admin's own row has no actions menu and shows a "You" badge.
  - Rows that are Awaiting password change show a password field: masked by default, an eye toggle to Show, and a Copy button (toast "Copied").
- **New Account** dialog (TanStack Form + shared Zod schema): email, name, App checkboxes (all unticked). On success the dialog switches to a result view with the masked password, Show and Copy, and the line "Send this to them yourself. They must change it when they first sign in." The same password stays on the row afterwards.
- **Edit Apps** sheet: one checkbox per App from `src/shared/apps.ts`, with Save and Cancel; Save sends the full set.
- **Reset password** confirm: "Sign {name} out everywhere and issue a new temporary password?" On success, show the result view as above.
- **Remove** confirm: "Sign {name} out everywhere and block sign-in? Their data is kept and you can restore them." Restore runs immediately with a toast.
- Every button shows a pending state; there are no optimistic updates.

## 6. Tests

- Integration (`src/server/core/admin-routes.int.test.ts`, real Postgres, Better Auth `testUtils()`):
  - A non-Admin gets 403 `forbidden_admin` on every route; a signed-out caller gets 401; an Admin with `mustChangePassword` gets 403 `password_change_required`.
  - Create, then list shows Awaiting password change with the password; signing in with it and changing the password clears both the flag and the row.
  - Reset rotates the password, deletes the target's sessions and repopulates the row.
  - Remove blocks sign-in, deletes sessions and clears the row; Restore allows sign-in with the old password.
  - Set Apps grants and revokes; the target then gets `forbidden_app` on a revoked App's route.
  - Self-targeting returns 409 on every `:id` action; an unknown id returns 404; a duplicate email returns 409; an unknown App key returns 400.
- Unit: `accounts.ts` changes are covered through the integration tests above; keep `scripts/admin.int.test.ts` green.
- e2e (`e2e/admin.spec.ts`): the Admin creates an Account with Notes, reads the password through Show, signs out, signs in as the new Account, is forced to change the password, and sees Notes on Home. The Admin then unticks Notes, and the Account's Home shows no Apps.

## 7. Delivery

- `pnpm changeset` (minor): "Admin screen for managing Accounts and their App access."
- Update `scripts/admin.ts`'s header comment: "there is no admin screen" is no longer true; the script remains for seeding the Admin and for recovery.
- No new dependencies are expected (shadcn `dialog`, `sheet`, `checkbox`, `badge` and `alert-dialog` may need adding via the pinned shadcn CLI; record nothing in `docs/versions.md` unless a package pin changes).
- No personal names or emails in code, tests or fixtures.

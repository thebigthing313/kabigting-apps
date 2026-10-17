// Account administration, shared by the Admin's Accounts screen and the admin CLI. There is no
// sign-up and no email: the Admin creates Accounts, passes the temporary password on out of band,
// and resets it on request.
import { randomInt } from "node:crypto"
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm"
import type { Auth } from "#server/auth/auth.ts"
import { ApiError } from "#server/core/errors.ts"
import type { Db } from "#server/db/client.ts"
import { appAccess, auth_user, temporaryPasswords } from "#server/db/schema/index.ts"
import { isAppKey } from "#shared/apps.ts"
import type { AdminAccount } from "#shared/schemas/admin.ts"

// createUser works server-side without a session. The admin plugin's setUserPassword, banUser and
// revokeUserSessions demand an admin session even server-side, so reset and ban go through Better
// Auth's internal adapter instead.
type AuthContext = Awaited<Auth["$context"]>
export type AccountDeps = {
  db: Db
  auth: {
    api: Pick<Auth["api"], "createUser">
    $context: Promise<{
      internalAdapter: Pick<
        AuthContext["internalAdapter"],
        "updatePassword" | "updateUser" | "deleteUserSessions"
      >
      password: Pick<AuthContext["password"], "hash">
    }>
  }
}

// No look-alike characters, so a password read aloud or copied by hand survives.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"

function passwordGroup(): string {
  return Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("")
}

/** Four groups of five characters: about 99 bits of entropy. */
export function generateTemporaryPassword(): string {
  return [passwordGroup(), passwordGroup(), passwordGroup(), passwordGroup()].join("-")
}

/** The id of the Account with this email (any case), or null. */
export async function accountIdByEmail(db: Db, email: string): Promise<string | null> {
  const [user] = await db
    .select({ id: auth_user.id })
    .from(auth_user)
    .where(eq(auth_user.email, email.toLowerCase()))
  return user?.id ?? null
}

/** The Admin's screen names an Account by id; the CLI names it by email. */
export type AccountRef = { userId: string } | { email: string }

async function findUserId(db: Db, ref: AccountRef): Promise<string> {
  if ("userId" in ref) return ref.userId
  const id = await accountIdByEmail(db, ref.email)
  if (!id) throw new Error(`No Account with email ${ref.email}`)
  return id
}

/** Keeps the issued password readable by the Admin until the Account replaces it. */
async function rememberTemporaryPassword(db: Db, userId: string, password: string) {
  await db
    .insert(temporaryPasswords)
    .values({ userId, password })
    .onConflictDoUpdate({
      target: temporaryPasswords.userId,
      set: { password, createdAt: sql`now()` },
    })
}

export async function forgetTemporaryPassword(db: Db, userId: string): Promise<void> {
  await db.delete(temporaryPasswords).where(eq(temporaryPasswords.userId, userId))
}

/** Every Account as the Admin's screen shows it, ordered by email. */
export async function listAccounts(db: Db, userId?: string): Promise<AdminAccount[]> {
  const users = await db
    .select({
      id: auth_user.id,
      email: auth_user.email,
      name: auth_user.name,
      role: auth_user.role,
      banned: auth_user.banned,
      mustChangePassword: auth_user.mustChangePassword,
      temporaryPassword: temporaryPasswords.password,
    })
    .from(auth_user)
    .leftJoin(temporaryPasswords, eq(temporaryPasswords.userId, auth_user.id))
    .where(userId === undefined ? undefined : eq(auth_user.id, userId))
    .orderBy(asc(auth_user.email))
  const grants = await db
    .select({ userId: appAccess.userId, appKey: appAccess.appKey })
    .from(appAccess)
    .where(
      inArray(
        appAccess.userId,
        users.map((user) => user.id),
      ),
    )
    .orderBy(asc(appAccess.appKey))

  return users.map((user) => {
    const status = user.banned
      ? "removed"
      : user.mustChangePassword
        ? "awaiting_password_change"
        : "active"
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role === "admin" ? "admin" : "user",
      status,
      apps: grants
        .filter((grant) => grant.userId === user.id)
        .map((grant) => grant.appKey)
        .filter(isAppKey),
      // Only while the Account still has to replace it; a password set any other way (the CLI,
      // the e2e seed) must not leave an old one readable.
      temporaryPassword: status === "awaiting_password_change" ? user.temporaryPassword : null,
    }
  })
}

/** One Account as the Admin's screen shows it, or null. */
export async function findAccount(db: Db, userId: string): Promise<AdminAccount | null> {
  const [account] = await listAccounts(db, userId)
  return account ?? null
}

function adminHoldsEveryApp(): ApiError {
  return new ApiError("validation_failed", "The Admin holds every App")
}

/** The Admin holds every App through the role, so App access is never set on an Admin. */
async function refuseAdmin(db: Db, userId: string): Promise<void> {
  const [user] = await db
    .select({ role: auth_user.role })
    .from(auth_user)
    .where(eq(auth_user.id, userId))
  if (user?.role === "admin") throw adminHoldsEveryApp()
}

export async function grantApps(db: Db, userId: string, apps: readonly string[]): Promise<void> {
  if (apps.length === 0) return
  await refuseAdmin(db, userId)
  await db
    .insert(appAccess)
    .values(apps.map((appKey) => ({ userId, appKey })))
    .onConflictDoNothing()
}

/**
 * Replaces the Account's App access with exactly these Apps, in one transaction. Revoking does
 * not sign the Account out: App routes refuse it from the next request.
 */
export async function setApps(db: Db, userId: string, apps: readonly string[]): Promise<void> {
  await refuseAdmin(db, userId)
  await db.transaction(async (tx) => {
    await tx
      .delete(appAccess)
      .where(
        and(
          eq(appAccess.userId, userId),
          apps.length > 0 ? notInArray(appAccess.appKey, [...apps]) : undefined,
        ),
      )
    if (apps.length > 0) {
      await tx
        .insert(appAccess)
        .values([...new Set(apps)].map((appKey) => ({ userId, appKey })))
        .onConflictDoNothing()
    }
  })
}

export async function createAccount(
  { db, auth }: AccountDeps,
  input: { email: string; name: string; apps: readonly string[]; role?: "admin" | "user" },
): Promise<{ userId: string; temporaryPassword: string }> {
  // Refused before the Account exists, so a refusal leaves nothing half made.
  if (input.role === "admin" && input.apps.length > 0) throw adminHoldsEveryApp()
  const temporaryPassword = generateTemporaryPassword()
  const { user } = await auth.api.createUser({
    body: {
      email: input.email,
      name: input.name,
      password: temporaryPassword,
      role: input.role ?? "user",
      data: { mustChangePassword: true },
    },
  })
  await grantApps(db, user.id, input.apps)
  await rememberTemporaryPassword(db, user.id, temporaryPassword)
  return { userId: user.id, temporaryPassword }
}

/** New temporary password, forced change again, and every session signed out. */
export async function resetAccount(
  { db, auth }: AccountDeps,
  ref: AccountRef,
): Promise<{ temporaryPassword: string }> {
  const userId = await findUserId(db, ref)
  const temporaryPassword = generateTemporaryPassword()
  const context = await auth.$context
  await context.internalAdapter.updatePassword(
    userId,
    await context.password.hash(temporaryPassword),
  )
  await context.internalAdapter.updateUser(userId, { mustChangePassword: true })
  await context.internalAdapter.deleteUserSessions(userId)
  await rememberTemporaryPassword(db, userId, temporaryPassword)
  return { temporaryPassword }
}

/**
 * Removal: ban (blocks sign-in), revoke every session and forget any temporary password. Data
 * is kept, and removing a Removed Account changes nothing.
 */
export async function removeAccount({ db, auth }: AccountDeps, ref: AccountRef) {
  const userId = await findUserId(db, ref)
  const context = await auth.$context
  await context.internalAdapter.updateUser(userId, {
    banned: true,
    banReason: "Removed by the Admin",
  })
  await context.internalAdapter.deleteUserSessions(userId)
  await forgetTemporaryPassword(db, userId)
}

/** Lets a Removed Account sign in again with its existing password. */
export async function restoreAccount({ db, auth }: AccountDeps, ref: AccountRef) {
  const userId = await findUserId(db, ref)
  const context = await auth.$context
  await context.internalAdapter.updateUser(userId, {
    banned: false,
    banReason: null,
    banExpires: null,
  })
}

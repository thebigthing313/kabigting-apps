// Account provisioning for the admin scripts. There is no sign-up and no email: the Admin
// creates Accounts, shares the one-time temporary password out of band, and resets it on request.
import { randomInt } from "node:crypto"
import { asc, eq, inArray, sql, type SQL } from "drizzle-orm"
import type { Auth } from "#server/auth/auth.ts"
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

async function findUserId(db: Db, email: string): Promise<string> {
  const id = await accountIdByEmail(db, email)
  if (!id) throw new Error(`No Account with email ${email}`)
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
export async function listAccounts(db: Db, where?: SQL): Promise<AdminAccount[]> {
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
    .where(where)
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

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "admin" ? "admin" : "user",
    status: user.banned
      ? "removed"
      : user.mustChangePassword
        ? "awaiting_password_change"
        : "active",
    apps: grants
      .filter((grant) => grant.userId === user.id)
      .map((grant) => grant.appKey)
      .filter(isAppKey),
    temporaryPassword: user.temporaryPassword,
  }))
}

/** One Account as the Admin's screen shows it, or null. */
export async function findAccount(db: Db, userId: string): Promise<AdminAccount | null> {
  const [account] = await listAccounts(db, eq(auth_user.id, userId))
  return account ?? null
}

export async function grantApps(db: Db, userId: string, apps: readonly string[]): Promise<void> {
  if (apps.length === 0) return
  await db
    .insert(appAccess)
    .values(apps.map((appKey) => ({ userId, appKey })))
    .onConflictDoNothing()
}

export async function createAccount(
  { db, auth }: AccountDeps,
  input: { email: string; name: string; apps: readonly string[]; role?: "admin" | "user" },
): Promise<{ userId: string; temporaryPassword: string }> {
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
  { email }: { email: string },
): Promise<{ temporaryPassword: string }> {
  const userId = await findUserId(db, email)
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

/** Removal: ban (blocks sign-in) and revoke every session. Data is kept. */
export async function banAccount({ db, auth }: AccountDeps, { email }: { email: string }) {
  const userId = await findUserId(db, email)
  const context = await auth.$context
  await context.internalAdapter.updateUser(userId, {
    banned: true,
    banReason: "Removed by the Admin",
  })
  await context.internalAdapter.deleteUserSessions(userId)
}

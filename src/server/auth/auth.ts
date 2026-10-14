import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { admin, testUtils } from "better-auth/plugins"
import type { Db } from "#server/db/client.ts"
import * as authSchema from "#server/db/schema/auth.ts"

export type AuthDeps = {
  db: Db
  baseURL: string
  secret: string
}

const THIRTY_DAYS = 60 * 60 * 24 * 30
const ONE_DAY = 60 * 60 * 24

/** Better Auth for admin-provisioned Accounts: no sign-up, no self-service reset. */
export function createAuth({ db, baseURL, secret }: AuthDeps) {
  return betterAuth({ ...options({ db, baseURL, secret }), plugins: [adminPlugin()] })
}

/**
 * Test-only instance with Better Auth's test helpers; never used by the server. Rate limiting is
 * off so tests can sign in repeatedly; `auth.int.test.ts` checks it is on in `createAuth`.
 */
export function createTestAuth({ db, baseURL, secret }: AuthDeps) {
  return betterAuth({
    ...options({ db, baseURL, secret }),
    rateLimit: { enabled: false },
    plugins: [adminPlugin(), testUtils()],
  })
}

function adminPlugin() {
  return admin({ defaultRole: "user", adminRoles: ["admin"] })
}

function options({ db, baseURL, secret }: AuthDeps) {
  return {
    baseURL,
    secret,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    user: {
      modelName: "auth_user",
      additionalFields: {
        mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: {
      modelName: "auth_session",
      expiresIn: THIRTY_DAYS,
      updateAge: ONE_DAY,
      cookieCache: { enabled: false },
    },
    account: { modelName: "auth_account" },
    verification: { modelName: "auth_verification" },
    rateLimit: { enabled: true },
    hooks: { before: rejectReusedPassword, after: clearMustChangePassword },
  } satisfies BetterAuthOptions
}

/**
 * On change-password: refuse a new password equal to the current (temporary) one, and always
 * revoke the Account's other sessions.
 */
const rejectReusedPassword = createAuthMiddleware(async (ctx) => {
  const body: unknown = ctx.body
  if (ctx.path !== "/change-password" || !isPasswordChange(body)) return undefined
  if (body.newPassword === body.currentPassword) {
    throw new APIError("BAD_REQUEST", {
      message: "Choose a password different from the current one",
    })
  }
  return { context: { body: { ...body, revokeOtherSessions: true } } }
})

/** After a successful change-password, the Account no longer has a temporary password. */
const clearMustChangePassword = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/change-password") return
  const userId = ctx.context.newSession?.user.id
  if (!userId) return
  await ctx.context.internalAdapter.updateUser(userId, { mustChangePassword: false })
})

function isPasswordChange(body: unknown): body is { currentPassword: string; newPassword: string } {
  return (
    typeof body === "object" &&
    body !== null &&
    "currentPassword" in body &&
    "newPassword" in body &&
    typeof body.currentPassword === "string" &&
    typeof body.newPassword === "string"
  )
}

export type Auth = ReturnType<typeof createAuth>

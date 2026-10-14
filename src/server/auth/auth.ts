import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"
import { admin } from "better-auth/plugins"
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
  return betterAuth({
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
    plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
  })
}

export type Auth = ReturnType<typeof createAuth>

import { Hono } from "hono"
import { listAccounts } from "#server/auth/accounts.ts"
import { bodyLimit } from "#server/core/body-limit.ts"
import type { AppEnv, Deps } from "#server/core/context.ts"
import { mustChangePassword } from "#server/core/must-change-password.ts"
import { requireAdmin } from "#server/core/require-admin.ts"
import { requireSession } from "#server/core/session.ts"

/** The Admin's Accounts screen. Part of the Shell, not an App: gated by role, not App access. */
export function adminRoutes({ db, auth }: Deps) {
  return new Hono<AppEnv>()
    .use(bodyLimit)
    .use(requireSession(auth))
    .use(mustChangePassword)
    .use(requireAdmin)
    .get("/accounts", async (c) => c.json({ rows: await listAccounts(db) }))
}

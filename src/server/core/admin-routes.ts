import { Hono } from "hono"
import {
  accountIdByEmail,
  createAccount,
  findAccount,
  banAccount,
  listAccounts,
  resetAccount,
  restoreAccount,
} from "#server/auth/accounts.ts"
import { bodyLimit } from "#server/core/body-limit.ts"
import type { AppEnv, Deps } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { mustChangePassword } from "#server/core/must-change-password.ts"
import { requireAdmin } from "#server/core/require-admin.ts"
import { requireSession } from "#server/core/session.ts"
import { validate } from "#server/core/validate.ts"
import { accountParams, createAccountInput } from "#shared/schemas/admin.ts"

async function accountRow(deps: Deps, userId: string) {
  const row = await findAccount(deps.db, userId)
  if (!row) throw new ApiError("not_found", "No such Account")
  return row
}

/**
 * The Account an action targets: never the caller (the Admin keeps the CLI for their own
 * Account, so the screen cannot lock them out), and it must exist.
 */
async function otherAccount(deps: Deps, callerId: string, userId: string) {
  if (userId === callerId) throw new ApiError("conflict", "You cannot change your own Account here")
  await accountRow(deps, userId)
  return { userId }
}

/** The Admin's Accounts screen. Part of the Shell, not an App: gated by role, not App access. */
export function adminRoutes(deps: Deps) {
  const { db } = deps

  return new Hono<AppEnv>()
    .use(bodyLimit)
    .use(requireSession(deps.auth))
    .use(mustChangePassword)
    .use(requireAdmin)
    .get("/accounts", async (c) => c.json({ rows: await listAccounts(db) }))
    .post("/accounts", validate("json", createAccountInput), async (c) => {
      const input = c.req.valid("json")
      if (await accountIdByEmail(db, input.email)) {
        throw new ApiError("conflict", "An Account with this email already exists")
      }
      const { userId } = await createAccount(deps, input)
      return c.json({ row: await accountRow(deps, userId) }, 201)
    })
    .post("/accounts/:id/reset", validate("param", accountParams), async (c) => {
      const ref = await otherAccount(deps, c.get("account").id, c.req.valid("param").id)
      await resetAccount(deps, ref)
      return c.json({ row: await accountRow(deps, ref.userId) })
    })
    .post("/accounts/:id/remove", validate("param", accountParams), async (c) => {
      const ref = await otherAccount(deps, c.get("account").id, c.req.valid("param").id)
      await banAccount(deps, ref)
      return c.json({ row: await accountRow(deps, ref.userId) })
    })
    .post("/accounts/:id/restore", validate("param", accountParams), async (c) => {
      const ref = await otherAccount(deps, c.get("account").id, c.req.valid("param").id)
      await restoreAccount(deps, ref)
      return c.json({ row: await accountRow(deps, ref.userId) })
    })
}

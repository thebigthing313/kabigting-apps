import { and, asc, eq, gt, inArray, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import type { AppEnv } from "#server/core/context.ts"
import type { Db } from "#server/db/client.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import { isForeignKeyViolation, isUniqueViolation } from "#server/apps/finances/db-errors.ts"
import { financesAccounts } from "#server/db/schema/index.ts"
import {
  accountQuery,
  createAccount,
  updateAccount,
  type AccountRow,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"

type AccountRecord = typeof financesAccounts.$inferSelect

function toRow(account: AccountRecord): AccountRow {
  return {
    id: account.id,
    name: account.name,
    note: account.note,
    archived: account.archived,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  }
}

const params = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Account")
}

/** Rethrows a taken name as a conflict the person can act on. */
function nameTaken(error: unknown, name: string | undefined): never {
  if (isUniqueViolation(error)) {
    throw new ApiError("conflict", `An Account named "${name}" already exists`)
  }
  throw error
}

/** Accounts: shared household rows, so there is no owner filter. */
export function accountRoutes(db: Db) {
  return new Hono<AppEnv>()
    .post("/query", validate("json", accountQuery), async (c) => {
      const { ids, limit, after } = c.req.valid("json")
      const accounts = await db
        .select()
        .from(financesAccounts)
        .where(
          and(
            ids ? inArray(financesAccounts.id, ids) : undefined,
            after ? gt(financesAccounts.id, after) : undefined,
          ),
        )
        .orderBy(asc(financesAccounts.id))
        .limit(limit ?? 5000)
      return c.json({ rows: accounts.map(toRow) })
    })
    .post("/", validate("json", createAccount), async (c) => {
      const input = c.req.valid("json")
      // The client supplies the id; an existing id is a conflict, never an overwrite.
      const [account] = await db
        .insert(financesAccounts)
        .values(input)
        .onConflictDoNothing({ target: financesAccounts.id })
        .returning()
        .catch((error: unknown) => nameTaken(error, input.name))
      if (!account) throw new ApiError("conflict", "An Account with this id already exists")
      return c.json(toRow(account), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateAccount), async (c) => {
      const changes = c.req.valid("json")
      const [account] = await db
        .update(financesAccounts)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(financesAccounts.id, c.req.valid("param").id))
        .returning()
        .catch((error: unknown) => nameTaken(error, changes.name))
      return account ? c.json(toRow(account)) : notFound()
    })
    .delete("/:id", validate("param", params), async (c) => {
      // Only an Account nothing references may go; one with history is archived instead.
      const [account] = await db
        .delete(financesAccounts)
        .where(eq(financesAccounts.id, c.req.valid("param").id))
        .returning()
        .catch((error: unknown) => {
          if (isForeignKeyViolation(error)) {
            throw new ApiError("conflict", "This Account has history; archive it instead")
          }
          throw error
        })
      return account ? c.json(toRow(account)) : notFound()
    })
}

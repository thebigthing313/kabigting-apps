import { asc, eq, gt, inArray, and, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isForeignKeyViolation, isUniqueViolation } from "#server/apps/finances/db-errors.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesWallets } from "#server/db/schema/index.ts"
import {
  createWallet,
  updateWallet,
  walletQuery,
  type WalletRow,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"
import { MAX_QUERY_IDS } from "#shared/schemas/query.ts"

type WalletRecord = typeof financesWallets.$inferSelect

function toRow(wallet: WalletRecord): WalletRow {
  return {
    id: wallet.id,
    name: wallet.name,
    inForecast: wallet.inForecast,
    lowBalanceThresholdCents: wallet.lowBalanceThresholdCents,
    shownAsOwed: wallet.shownAsOwed,
    bankAccountLast4: wallet.bankAccountLast4,
    archived: wallet.archived,
    createdAt: wallet.createdAt.toISOString(),
    updatedAt: wallet.updatedAt.toISOString(),
  }
}

const walletParams = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Wallet")
}

/**
 * A taken name is the caller's to fix, not a server fault. The id conflict is handled by the
 * insert, and only uploads set the bank account hash, so the name is the one unique left.
 */
async function namedUniquely<T>(write: Promise<T>): Promise<T> {
  try {
    return await write
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError("conflict", "A Wallet with this name already exists")
    }
    throw error
  }
}

/** Mounted under the Finances router, which has already checked the session and App access. */
export function walletRoutes(db: Db) {
  return new Hono<AppEnv>()
    .post("/query", validate("json", walletQuery), async (c) => {
      const { ids, limit, after } = c.req.valid("json")
      const wallets = await db
        .select()
        .from(financesWallets)
        .where(
          and(
            ids ? inArray(financesWallets.id, ids) : undefined,
            after ? gt(financesWallets.id, after) : undefined,
          ),
        )
        .orderBy(asc(financesWallets.id))
        .limit(limit ?? MAX_QUERY_IDS)
      return c.json({ rows: wallets.map(toRow) })
    })
    .post("/", validate("json", createWallet), async (c) => {
      // The client supplies the id; an existing id is a conflict, never an overwrite.
      const [wallet] = await namedUniquely(
        db
          .insert(financesWallets)
          .values(c.req.valid("json"))
          .onConflictDoNothing({ target: financesWallets.id })
          .returning(),
      )
      if (!wallet) throw new ApiError("conflict", "A Wallet with this id already exists")
      return c.json(toRow(wallet), 201)
    })
    .patch("/:id", validate("param", walletParams), validate("json", updateWallet), async (c) => {
      const { bankAccountLast4, ...changes } = c.req.valid("json")
      // Forget clears the remembered bank account entirely, hash and all.
      const forget = bankAccountLast4 === null ? { bankAccountHash: null, bankAccountLast4 } : {}
      const [wallet] = await namedUniquely(
        db
          .update(financesWallets)
          .set({ ...changes, ...forget, updatedAt: sql`now()` })
          .where(eq(financesWallets.id, c.req.valid("param").id))
          .returning(),
      )
      return wallet ? c.json(toRow(wallet)) : notFound()
    })
    .delete("/:id", validate("param", walletParams), async (c) => {
      // Only a Wallet nothing references may go; one with history is archived instead.
      const [wallet] = await db
        .delete(financesWallets)
        .where(eq(financesWallets.id, c.req.valid("param").id))
        .returning()
        .catch((error: unknown) => {
          if (isForeignKeyViolation(error)) {
            throw new ApiError("conflict", "This Wallet has history; archive it instead")
          }
          throw error
        })
      return wallet ? c.json(toRow(wallet)) : notFound()
    })
}

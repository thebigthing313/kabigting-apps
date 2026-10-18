import { and, eq, inArray, isNull, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { occurrenceToRow } from "#server/apps/finances/occurrences.ts"
import { isReconciledActual, toTransactionRow } from "#server/apps/finances/transactions.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesOccurrences, financesTransactions } from "#server/db/schema/index.ts"
import { findHandEntryTwin, TWIN_WINDOW_DAYS } from "#shared/finances/reconcile.ts"
import {
  isImported,
  markReviewed,
  type ReconcileResult,
  sameAsHandEntry,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

const params = z.strictObject({ id })

function invalid(message: string): never {
  throw new ApiError("validation_failed", message)
}

async function transactionForUpdate(tx: Tx, transactionId: string, missing: string) {
  const [row] = await tx
    .select()
    .from(financesTransactions)
    .where(eq(financesTransactions.id, transactionId))
    .for("update")
  if (!row) throw new ApiError("not_found", missing)
  return row
}

/**
 * To review: the uploaded lines no one has looked at yet. A person Reconciles one (the Reconcile
 * command), calls it unplanned, or finds it repeats an Actual they entered by hand.
 */
export function reviewRoutes(db: Db) {
  const table = financesTransactions
  return new Hono<AppEnv>()
    .post("/mark-reviewed", validate("json", markReviewed), async (c) => {
      const { ids } = c.req.valid("json")
      // Only Actuals still waiting change, so a line keeps the time it was first reviewed.
      const rows = await db
        .update(table)
        .set({ reviewedAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(inArray(table.id, ids), eq(table.status, "actual"), isNull(table.reviewedAt)))
        .returning()
      return c.json({ rows: rows.map(toTransactionRow) })
    })
    .post(
      "/:id/same-as-hand-entry",
      validate("param", params),
      validate("json", sameAsHandEntry),
      async (c) => {
        const lineId = c.req.valid("param").id
        const { handEntryId } = c.req.valid("json")
        const result = await db.transaction(async (tx): Promise<ReconcileResult> => {
          const line = await transactionForUpdate(tx, lineId, "No such line")
          const hand = await transactionForUpdate(tx, handEntryId, "No such hand entry")
          if (line.status !== "actual" || !isImported(line) || line.ignored) {
            invalid("Only an uploaded line can be the same as a hand entry")
          }
          if (!findHandEntryTwin(line, [hand])) {
            invalid(
              `Only an Actual entered by hand in the same Wallet, for the same amount, within ${TWIN_WINDOW_DAYS} days, can be the same`,
            )
          }
          if ((await isReconciledActual(tx, line.id)) && (await isReconciledActual(tx, hand.id))) {
            throw new ApiError("conflict", "Both are Reconciled; un-Reconcile one first")
          }

          // The hand entry's Reconcile, if it has one, moves to the line before it goes.
          const occurrences = await tx
            .update(financesOccurrences)
            .set({ reconciledTransactionId: line.id, updatedAt: sql`now()` })
            .where(eq(financesOccurrences.reconciledTransactionId, hand.id))
            .returning()
          const planned = await tx
            .update(table)
            .set({ reconciledActualId: line.id, updatedAt: sql`now()` })
            .where(eq(table.reconciledActualId, hand.id))
            .returning()
          await tx.delete(table).where(eq(table.id, hand.id))
          // The bank's amount and date stay the truth; the person's labels come over.
          const [kept] = await tx
            .update(table)
            .set({
              accountId: hand.accountId ?? line.accountId,
              categoryId: hand.categoryId ?? line.categoryId,
              note: hand.note || line.note,
              reviewedAt: sql`coalesce(${table.reviewedAt}, now())`,
              updatedAt: sql`now()`,
            })
            .where(eq(table.id, line.id))
            .returning()
          if (!kept) throw new Error("Keeping the uploaded line wrote nothing")
          return {
            occurrences: occurrences.map(occurrenceToRow),
            deletedOccurrences: [],
            transactions: [...planned, kept].map(toTransactionRow),
            deletedTransactions: [hand.id],
            transfers: [],
          }
        })
        return c.json(result)
      },
    )
}

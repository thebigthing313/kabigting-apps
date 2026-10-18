import { and, eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { isUniqueViolation } from "#server/apps/finances/db-errors.ts"
import { occurrenceToRow } from "#server/apps/finances/occurrences.ts"
import { transactionToRow } from "#server/apps/finances/transactions.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import {
  financesOccurrences,
  financesSchedules,
  financesTransactions,
} from "#server/db/schema/index.ts"
import { isOccurrenceDate, isReconciled } from "#shared/finances/occurrences.ts"
import { reconcile, type ReconcileResult, unreconcile } from "#shared/finances/schemas.ts"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type TransactionRecord = typeof financesTransactions.$inferSelect
type OccurrenceRecord = typeof financesOccurrences.$inferSelect

function invalid(message: string): never {
  throw new ApiError("validation_failed", message)
}

function conflict(message: string): never {
  throw new ApiError("conflict", message)
}

/** The Actual, locked for the rest of the transaction so it is Reconciled at most once. */
async function actualForUpdate(tx: Tx, actualId: string): Promise<TransactionRecord> {
  const [actual] = await tx
    .select()
    .from(financesTransactions)
    .where(eq(financesTransactions.id, actualId))
    .for("update")
  if (!actual) throw new ApiError("not_found", "No such Actual")
  return actual
}

/** One Reconcile per Actual: refused when an Occurrence or a one-off already points to it. */
async function refuseReconciledActual(tx: Tx, actualId: string) {
  const [occurrence] = await tx
    .select({ id: financesOccurrences.id })
    .from(financesOccurrences)
    .where(eq(financesOccurrences.reconciledTransactionId, actualId))
    .limit(1)
  const [planned] = await tx
    .select({ id: financesTransactions.id })
    .from(financesTransactions)
    .where(eq(financesTransactions.reconciledActualId, actualId))
    .limit(1)
  if (occurrence || planned) conflict("This Actual is already Reconciled; un-Reconcile it first")
}

/** Links the Occurrence to the Actual, storing it if it was only computed; returns its row. */
async function linkOccurrence(
  tx: Tx,
  actual: TransactionRecord,
  ref: { scheduleId: string; nominalDate: string },
) {
  const [schedule] = await tx
    .select()
    .from(financesSchedules)
    .where(eq(financesSchedules.id, ref.scheduleId))
    .for("update")
  if (!schedule) throw new ApiError("not_found", "No such Schedule")
  if (schedule.toWalletId !== null) {
    invalid("A Transfer Schedule's Occurrences are Reconciled to Transfers")
  }
  if (schedule.walletId !== actual.walletId) invalid("Reconcile within one Wallet")
  if (!isOccurrenceDate(schedule, ref.nominalDate)) {
    invalid("The Schedule doesn't fall on that date")
  }
  const [stored] = await tx
    .select()
    .from(financesOccurrences)
    .where(
      and(
        eq(financesOccurrences.scheduleId, schedule.id),
        eq(financesOccurrences.nominalDate, ref.nominalDate),
      ),
    )
    .for("update")
  let linked: OccurrenceRecord | undefined
  if (stored) {
    if (isReconciled(stored)) conflict("That Occurrence is already Reconciled")
    if (stored.skipped) conflict("That Occurrence is skipped; unskip it first")
    ;[linked] = await tx
      .update(financesOccurrences)
      .set({ reconciledTransactionId: actual.id, updatedAt: sql`now()` })
      .where(eq(financesOccurrences.id, stored.id))
      .returning()
  } else {
    ;[linked] = await tx
      .insert(financesOccurrences)
      .values({ ...ref, reconciledTransactionId: actual.id })
      .returning()
  }
  if (!linked) throw new Error("Reconciling the Occurrence wrote nothing")
  return { occurrence: linked, categoryId: schedule.categoryId }
}

/** Points the one-off Planned at the Actual; returns its row. */
async function linkOneOff(tx: Tx, actual: TransactionRecord, plannedId: string) {
  const [planned] = await tx
    .select()
    .from(financesTransactions)
    .where(eq(financesTransactions.id, plannedId))
    .for("update")
  if (!planned) throw new ApiError("not_found", "No such Planned Transaction")
  if (planned.status !== "planned") invalid("Reconcile an Actual to a Planned item")
  if (planned.walletId !== actual.walletId) invalid("Reconcile within one Wallet")
  if (planned.reconciledActualId !== null) conflict("That Planned item is already Reconciled")
  const [linked] = await tx
    .update(financesTransactions)
    .set({ reconciledActualId: actual.id, updatedAt: sql`now()` })
    .where(eq(financesTransactions.id, planned.id))
    .returning()
  if (!linked) throw new Error("Reconciling the Planned item wrote nothing")
  return { planned: linked, categoryId: planned.categoryId }
}

/** Two people Reconciling the same unstored Occurrence at once: the second is refused. */
function raced(error: unknown): never {
  if (isUniqueViolation(error)) conflict("That Occurrence was Reconciled just now")
  throw error
}

/**
 * Reconcile and Un-Reconcile. A Reconcile is one to one, and the Actual's amount and date are the
 * truth: the Planned item only leaves the Forecast, keeping its own amount for an Un-Reconcile.
 */
export function reconcileRoutes(db: Db) {
  return new Hono<AppEnv>()
    .post("/reconcile", validate("json", reconcile), async (c) => {
      const body = c.req.valid("json")
      const result = await db
        .transaction(async (tx): Promise<ReconcileResult> => {
          const actual = await actualForUpdate(tx, body.actualId)
          if (actual.status !== "actual") invalid("Reconcile an Actual to a Planned item")
          if (actual.ignored) invalid("An ignored line can't be Reconciled; restore it first")
          await refuseReconciledActual(tx, actual.id)

          const linked =
            body.plannedKind === "occurrence"
              ? await linkOccurrence(tx, actual, body.plannedRef)
              : await linkOneOff(tx, actual, body.plannedRef)
          // A person confirmed it, so it no longer waits in To review. It takes the Planned
          // item's Category only when it has none of its own.
          const [updated] = await tx
            .update(financesTransactions)
            .set({
              reviewedAt: sql`coalesce(${financesTransactions.reviewedAt}, now())`,
              categoryId: actual.categoryId ?? linked.categoryId,
              updatedAt: sql`now()`,
            })
            .where(eq(financesTransactions.id, actual.id))
            .returning()
          if (!updated) throw new Error("Reconciling the Actual wrote nothing")
          return {
            occurrences: "occurrence" in linked ? [occurrenceToRow(linked.occurrence)] : [],
            deletedOccurrences: [],
            transactions: [
              ...("planned" in linked ? [transactionToRow(linked.planned)] : []),
              transactionToRow(updated),
            ],
          }
        })
        .catch(raced)
      return c.json(result)
    })
    .post("/unreconcile", validate("json", unreconcile), async (c) => {
      const { actualId } = c.req.valid("json")
      const result = await db.transaction(async (tx): Promise<ReconcileResult> => {
        await actualForUpdate(tx, actualId)
        const changed: ReconcileResult = {
          occurrences: [],
          deletedOccurrences: [],
          transactions: [],
        }

        const [occurrence] = await tx
          .select()
          .from(financesOccurrences)
          .where(eq(financesOccurrences.reconciledTransactionId, actualId))
          .for("update")
        if (occurrence) {
          const overridden =
            occurrence.overrideAmountCents !== null ||
            occurrence.overrideDate !== null ||
            occurrence.skipped
          if (overridden) {
            // Back to outstanding with the override it had before.
            const [unlinked] = await tx
              .update(financesOccurrences)
              .set({ reconciledTransactionId: null, updatedAt: sql`now()` })
              .where(eq(financesOccurrences.id, occurrence.id))
              .returning()
            if (unlinked) changed.occurrences.push(occurrenceToRow(unlinked))
          } else {
            // Stored only for the link, so it is computed from its Schedule again.
            await tx.delete(financesOccurrences).where(eq(financesOccurrences.id, occurrence.id))
            changed.deletedOccurrences.push(occurrence.id)
          }
        }

        const unlinked = await tx
          .update(financesTransactions)
          .set({ reconciledActualId: null, updatedAt: sql`now()` })
          .where(eq(financesTransactions.reconciledActualId, actualId))
          .returning()
        changed.transactions.push(...unlinked.map(transactionToRow))

        if (!occurrence && unlinked.length === 0) conflict("This Actual isn't Reconciled")
        return changed
      })
      return c.json(result)
    })
}

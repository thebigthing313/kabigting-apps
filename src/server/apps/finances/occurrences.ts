import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isForeignKeyViolation, isUniqueViolation } from "#server/apps/finances/db-errors.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesOccurrences, financesSchedules } from "#server/db/schema/index.ts"
import { isOccurrenceDate } from "#shared/finances/occurrences.ts"
import {
  createOccurrence,
  occurrenceQuery,
  updateOccurrence,
  type OccurrenceRow,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"
import { MAX_QUERY_IDS } from "#shared/schemas/query.ts"

type OccurrenceRecord = typeof financesOccurrences.$inferSelect
type ScheduleRecord = typeof financesSchedules.$inferSelect

function toRow(occurrence: OccurrenceRecord): OccurrenceRow {
  return {
    id: occurrence.id,
    scheduleId: occurrence.scheduleId,
    nominalDate: occurrence.nominalDate,
    overrideAmountCents: occurrence.overrideAmountCents,
    overrideDate: occurrence.overrideDate,
    skipped: occurrence.skipped,
    reconciledTransactionId: occurrence.reconciledTransactionId,
    reconciledTransferId: occurrence.reconciledTransferId,
    createdAt: occurrence.createdAt.toISOString(),
    updatedAt: occurrence.updatedAt.toISOString(),
  }
}

const params = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Occurrence")
}

function reconciledConflict(): never {
  throw new ApiError("conflict", "A Reconciled Occurrence can't be changed")
}

/** Neither Reconcile link is set. */
const notReconciled = and(
  isNull(financesOccurrences.reconciledTransactionId),
  isNull(financesOccurrences.reconciledTransferId),
)

function isReconciled(occurrence: OccurrenceRecord): boolean {
  return occurrence.reconciledTransactionId !== null || occurrence.reconciledTransferId !== null
}

/** A Transfer moves a positive amount, so its override (a card's statement balance) does too. */
function checkAmount(schedule: ScheduleRecord, overrideAmountCents: number | null | undefined) {
  const transfer = schedule.toWalletId !== null
  if (transfer && overrideAmountCents != null && overrideAmountCents <= 0) {
    throw new ApiError("validation_failed", "A Transfer moves a positive amount")
  }
}

/**
 * Occurrences a person overrode or skipped, keyed by Schedule and nominal date. Deleting one puts
 * it back on its Schedule's terms. A Reconciled one is never changed here.
 */
export function occurrenceRoutes(db: Db) {
  return new Hono<AppEnv>()
    .post("/query", validate("json", occurrenceQuery), async (c) => {
      const { ids, limit, after } = c.req.valid("json")
      const occurrences = await db
        .select()
        .from(financesOccurrences)
        .where(
          and(
            ids ? inArray(financesOccurrences.id, ids) : undefined,
            after ? gt(financesOccurrences.id, after) : undefined,
          ),
        )
        .orderBy(asc(financesOccurrences.id))
        .limit(limit ?? MAX_QUERY_IDS)
      return c.json({ rows: occurrences.map(toRow) })
    })
    .post("/", validate("json", createOccurrence), async (c) => {
      const input = c.req.valid("json")
      const [schedule] = await db
        .select()
        .from(financesSchedules)
        .where(eq(financesSchedules.id, input.scheduleId))
      if (!schedule) throw new ApiError("validation_failed", "No such Schedule")
      if (!isOccurrenceDate(schedule, input.nominalDate)) {
        throw new ApiError("validation_failed", "The Schedule doesn't fall on that date")
      }
      checkAmount(schedule, input.overrideAmountCents)
      // The client supplies the id; an existing id is a conflict, never an overwrite.
      const [occurrence] = await db
        .insert(financesOccurrences)
        .values(input)
        .onConflictDoNothing({ target: financesOccurrences.id })
        .returning()
        .catch((error: unknown) => {
          if (isUniqueViolation(error)) {
            throw new ApiError("conflict", "That Occurrence is already stored")
          }
          if (isForeignKeyViolation(error)) {
            throw new ApiError("validation_failed", "No such Schedule")
          }
          throw error
        })
      if (!occurrence) throw new ApiError("conflict", "An Occurrence with this id already exists")
      return c.json(toRow(occurrence), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateOccurrence), async (c) => {
      const occurrenceId = c.req.valid("param").id
      const changes = c.req.valid("json")
      const [found] = await db
        .select()
        .from(financesOccurrences)
        .innerJoin(financesSchedules, eq(financesOccurrences.scheduleId, financesSchedules.id))
        .where(eq(financesOccurrences.id, occurrenceId))
      if (!found) notFound()
      if (isReconciled(found.finances_occurrences)) reconciledConflict()
      checkAmount(found.finances_schedules, changes.overrideAmountCents)
      const [occurrence] = await db
        .update(financesOccurrences)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(and(eq(financesOccurrences.id, occurrenceId), notReconciled))
        .returning()
      // Reconciled in the moment between the read and the write.
      return occurrence ? c.json(toRow(occurrence)) : reconciledConflict()
    })
    .delete("/:id", validate("param", params), async (c) => {
      const occurrenceId = c.req.valid("param").id
      const [occurrence] = await db
        .delete(financesOccurrences)
        .where(and(eq(financesOccurrences.id, occurrenceId), notReconciled))
        .returning()
      if (occurrence) return c.json(toRow(occurrence))
      const [kept] = await db
        .select({ id: financesOccurrences.id })
        .from(financesOccurrences)
        .where(eq(financesOccurrences.id, occurrenceId))
      return kept ? reconciledConflict() : notFound()
    })
}

import { and, asc, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isForeignKeyViolation, violatedCheck } from "#server/apps/finances/db-errors.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesOccurrences, financesSchedules } from "#server/db/schema/index.ts"
import {
  createSchedule,
  scheduleQuery,
  updateSchedule,
  type ScheduleRow,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"
import { MAX_QUERY_IDS } from "#shared/schemas/query.ts"

type ScheduleRecord = typeof financesSchedules.$inferSelect

function toRow(schedule: ScheduleRecord): ScheduleRow {
  return {
    id: schedule.id,
    walletId: schedule.walletId,
    toWalletId: schedule.toWalletId,
    accountId: schedule.accountId,
    amountCents: schedule.amountCents,
    unit: schedule.unit,
    every: schedule.every,
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    categoryId: schedule.categoryId,
    note: schedule.note,
    predecessorId: schedule.predecessorId,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  }
}

const params = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Schedule")
}

/**
 * The database is the last word on a Schedule's rules (a Transfer has no Category) and on what it
 * refers to, so a write it refuses is the caller's mistake, not a server fault.
 */
function refused(error: unknown): never {
  const check = violatedCheck(error)
  if (check === "finances_schedules_transfer_no_category") {
    throw new ApiError("validation_failed", "A Transfer Schedule can't have a Category")
  }
  if (check !== undefined) {
    throw new ApiError("validation_failed", "That Schedule breaks one of its rules")
  }
  if (isForeignKeyViolation(error)) {
    throw new ApiError("validation_failed", "No such Wallet, Account or Category")
  }
  throw error
}

/** Schedules: recurrences that make Planned Transactions or Transfers. Shared household data. */
export function scheduleRoutes(db: Db) {
  return new Hono<AppEnv>()
    .post("/query", validate("json", scheduleQuery), async (c) => {
      const { ids, limit, after } = c.req.valid("json")
      const schedules = await db
        .select()
        .from(financesSchedules)
        .where(
          and(
            ids ? inArray(financesSchedules.id, ids) : undefined,
            after ? gt(financesSchedules.id, after) : undefined,
          ),
        )
        .orderBy(asc(financesSchedules.id))
        .limit(limit ?? MAX_QUERY_IDS)
      return c.json({ rows: schedules.map(toRow) })
    })
    .post("/", validate("json", createSchedule), async (c) => {
      // The client supplies the id; an existing id is a conflict, never an overwrite.
      const [schedule] = await db
        .insert(financesSchedules)
        .values(c.req.valid("json"))
        .onConflictDoNothing({ target: financesSchedules.id })
        .returning()
        .catch(refused)
      if (!schedule) throw new ApiError("conflict", "A Schedule with this id already exists")
      return c.json(toRow(schedule), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateSchedule), async (c) => {
      const [schedule] = await db
        .update(financesSchedules)
        .set({ ...c.req.valid("json"), updatedAt: sql`now()` })
        .where(eq(financesSchedules.id, c.req.valid("param").id))
        .returning()
        .catch(refused)
      return schedule ? c.json(toRow(schedule)) : notFound()
    })
    .delete("/:id", validate("param", params), async (c) => {
      const scheduleId = c.req.valid("param").id
      // Its overrides and skips go with it, unless something is Reconciled to it.
      const schedule = await db
        .transaction(async (tx) => {
          const [reconciled] = await tx
            .select({ id: financesOccurrences.id })
            .from(financesOccurrences)
            .where(
              and(
                eq(financesOccurrences.scheduleId, scheduleId),
                or(
                  isNotNull(financesOccurrences.reconciledTransactionId),
                  isNotNull(financesOccurrences.reconciledTransferId),
                ),
              ),
            )
            .limit(1)
          if (reconciled) {
            throw new ApiError("conflict", "Something is Reconciled to this Schedule")
          }
          await tx.delete(financesOccurrences).where(eq(financesOccurrences.scheduleId, scheduleId))
          const [deleted] = await tx
            .delete(financesSchedules)
            .where(eq(financesSchedules.id, scheduleId))
            .returning()
          return deleted
        })
        .catch((error: unknown) => {
          if (isForeignKeyViolation(error)) {
            throw new ApiError("conflict", "A later Schedule continues this one")
          }
          throw error
        })
      return schedule ? c.json(toRow(schedule)) : notFound()
    })
}

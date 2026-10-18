import { and, asc, eq, gt, gte, inArray, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isForeignKeyViolation, violatedCheck } from "#server/apps/finances/db-errors.ts"
import {
  notReconciled,
  occurrenceToRow,
  reconciledOccurrence,
} from "#server/apps/finances/occurrences.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesOccurrences, financesSchedules } from "#server/db/schema/index.ts"
import { addDays } from "#shared/dates.ts"
import {
  overridesAfter,
  overridesOffNewTerms,
  scheduleChain,
} from "#shared/finances/occurrences.ts"
import {
  changeScheduleFrom,
  createSchedule,
  endSchedule,
  scheduleQuery,
  updateSchedule,
  type ScheduleCommandResult,
  type ScheduleRow,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"
import { MAX_QUERY_IDS } from "#shared/schemas/query.ts"

type ScheduleRecord = typeof financesSchedules.$inferSelect

export function scheduleToRow(schedule: ScheduleRecord): ScheduleRow {
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
  if (check === "finances_schedules_transfer_positive") {
    throw new ApiError("validation_failed", "A Transfer moves a positive amount")
  }
  if (check === "finances_schedules_end_after_start") {
    throw new ApiError("validation_failed", "The end date can't be before the start date")
  }
  if (check !== undefined) {
    throw new ApiError("validation_failed", "That Schedule breaks one of its rules")
  }
  if (isForeignKeyViolation(error)) {
    throw new ApiError("validation_failed", "No such Wallet, Account or Category")
  }
  throw error
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

function invalid(message: string): never {
  throw new ApiError("validation_failed", message)
}

/**
 * The Schedule, locked for the rest of the transaction. Only the newest in a chain changes its
 * terms or end date: an older one already ended where its successor took over.
 */
async function newestForUpdate(tx: Tx, scheduleId: string): Promise<ScheduleRecord> {
  const [schedule] = await tx
    .select()
    .from(financesSchedules)
    .where(eq(financesSchedules.id, scheduleId))
    .for("update")
  if (!schedule) notFound()
  const [successor] = await tx
    .select({ id: financesSchedules.id })
    .from(financesSchedules)
    .where(eq(financesSchedules.predecessorId, scheduleId))
    .limit(1)
  if (successor) throw new ApiError("conflict", "A later Schedule continues this one")
  return schedule
}

/**
 * The person confirmed a list of overrides to delete; go ahead only if it is still exactly what
 * would go.
 */
function confirmed(doomed: readonly string[], confirmDeleteOverrides: readonly string[]) {
  const listed = new Set(confirmDeleteOverrides)
  if (doomed.length !== listed.size || doomed.some((doomedId) => !listed.has(doomedId))) {
    throw new ApiError("conflict", "The overrides to delete have changed; look again")
  }
}

/** Deletes the given stored Occurrences, never a Reconciled one; returns the ids it deleted. */
async function deleteOverrides(tx: Tx, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const deleted = await tx
    .delete(financesOccurrences)
    .where(and(inArray(financesOccurrences.id, [...ids]), notReconciled))
    .returning({ id: financesOccurrences.id })
  return deleted.map((row) => row.id)
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
      return c.json({ rows: schedules.map(scheduleToRow) })
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
      return c.json(scheduleToRow(schedule), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateSchedule), async (c) => {
      const scheduleId = c.req.valid("param").id
      const changes = c.req.valid("json")
      const schedule = await db
        .transaction(async (tx) => {
          // Reopening a Schedule a later one continues would run both terms at once.
          if (changes.endDate === null) await newestForUpdate(tx, scheduleId)
          const [updated] = await tx
            .update(financesSchedules)
            .set({ ...changes, updatedAt: sql`now()` })
            .where(eq(financesSchedules.id, scheduleId))
            .returning()
          return updated
        })
        .catch(refused)
      return schedule ? c.json(scheduleToRow(schedule)) : notFound()
    })
    .post(
      "/:id/change-from",
      validate("param", params),
      validate("json", changeScheduleFrom),
      async (c) => {
        const { date, changes, confirmDeleteOverrides } = c.req.valid("json")
        const result = await db
          .transaction(async (tx): Promise<ScheduleCommandResult> => {
            const schedule = await newestForUpdate(tx, c.req.valid("param").id)
            if (date <= schedule.startDate) {
              invalid("Change from a date after the Schedule starts")
            }
            if (schedule.endDate !== null && date > schedule.endDate) {
              invalid("Change from a date on or before the Schedule ends")
            }
            const startDate = changes.startDate ?? date
            if (startDate < date) invalid("The new terms can't start before the change")
            const { id: _id, createdAt: _created, updatedAt: _updated, ...kept } = schedule
            const terms = { ...kept, ...changes, startDate, predecessorId: schedule.id }
            // The old terms stop at the change, so its later overrides belong to the new ones.
            // Those the new terms never fall on go, once the person confirmed exactly that list.
            const stored = await tx
              .select()
              .from(financesOccurrences)
              .where(eq(financesOccurrences.scheduleId, schedule.id))
            const doomed = overridesOffNewTerms(stored, date, terms).map((row) => row.id)
            confirmed(doomed, confirmDeleteOverrides)
            const deleted = await deleteOverrides(tx, doomed)
            const [ended] = await tx
              .update(financesSchedules)
              .set({ endDate: addDays(date, -1), updatedAt: sql`now()` })
              .where(eq(financesSchedules.id, schedule.id))
              .returning()
            const [successor] = await tx.insert(financesSchedules).values(terms).returning()
            if (!ended || !successor) throw new Error("The Schedule change wrote nothing")
            const moved = await tx
              .update(financesOccurrences)
              .set({ scheduleId: successor.id, updatedAt: sql`now()` })
              .where(
                and(
                  eq(financesOccurrences.scheduleId, schedule.id),
                  gte(financesOccurrences.nominalDate, date),
                  notReconciled,
                ),
              )
              .returning()
            return {
              schedules: [ended, successor].map(scheduleToRow),
              occurrences: moved.map(occurrenceToRow),
              deletedOccurrences: deleted,
            }
          })
          .catch(refused)
        return c.json(result)
      },
    )
    .post("/:id/end", validate("param", params), validate("json", endSchedule), async (c) => {
      const { endDate, confirmDeleteOverrides } = c.req.valid("json")
      const result = await db
        .transaction(async (tx): Promise<ScheduleCommandResult> => {
          const schedule = await newestForUpdate(tx, c.req.valid("param").id)
          const stored = await tx
            .select()
            .from(financesOccurrences)
            .where(eq(financesOccurrences.scheduleId, schedule.id))
          const doomed = overridesAfter(stored, endDate).map((row) => row.id)
          confirmed(doomed, confirmDeleteOverrides)
          const deleted = await deleteOverrides(tx, doomed)
          const [ended] = await tx
            .update(financesSchedules)
            .set({ endDate, updatedAt: sql`now()` })
            .where(eq(financesSchedules.id, schedule.id))
            .returning()
          if (!ended) throw new Error("Ending the Schedule wrote nothing")
          return { schedules: [scheduleToRow(ended)], occurrences: [], deletedOccurrences: deleted }
        })
        .catch(refused)
      return c.json(result)
    })
    .delete("/:id", validate("param", params), async (c) => {
      const scheduleId = c.req.valid("param").id
      // The chain reads as one Schedule, so it goes as one, with its overrides and skips, unless
      // something is Reconciled to any part of it.
      const schedule = await db.transaction(async (tx) => {
        const links = await tx
          .select({ id: financesSchedules.id, predecessorId: financesSchedules.predecessorId })
          .from(financesSchedules)
          .for("update")
        const chain = scheduleChain(links, scheduleId).map((link) => link.id)
        if (chain.length === 0) return undefined
        const [reconciled] = await tx
          .select({ id: financesOccurrences.id })
          .from(financesOccurrences)
          .where(and(inArray(financesOccurrences.scheduleId, chain), reconciledOccurrence))
          .limit(1)
        if (reconciled) {
          throw new ApiError("conflict", "Something is Reconciled to this Schedule")
        }
        await tx.delete(financesOccurrences).where(inArray(financesOccurrences.scheduleId, chain))
        let deleted: ScheduleRecord | undefined
        // Newest first, so no Schedule is deleted while a later one still points to it.
        for (const memberId of chain) {
          const [row] = await tx
            .delete(financesSchedules)
            .where(eq(financesSchedules.id, memberId))
            .returning()
          if (memberId === scheduleId) deleted = row
        }
        return deleted
      })
      return schedule ? c.json(scheduleToRow(schedule)) : notFound()
    })
}

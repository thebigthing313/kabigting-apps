import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isForeignKeyViolation, isUniqueViolation } from "#server/apps/finances/db-errors.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { queryLimit, withinCap } from "#server/core/query-limit.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesBalanceChecks } from "#server/db/schema/index.ts"
import {
  balanceCheckQuery,
  type BalanceCheckRow,
  createBalanceCheck,
  updateBalanceCheck,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"

type BalanceCheckRecord = typeof financesBalanceChecks.$inferSelect

function toRow(check: BalanceCheckRecord): BalanceCheckRow {
  return {
    id: check.id,
    walletId: check.walletId,
    date: check.date,
    amountCents: check.amountCents,
    createdAt: check.createdAt.toISOString(),
    updatedAt: check.updatedAt.toISOString(),
  }
}

const params = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Balance check")
}

/**
 * A missing Wallet and a taken key are the caller's to fix, not server faults. `taken` says
 * which unique key the write can still collide with.
 */
async function checked<T>(write: Promise<T>, taken: string): Promise<T> {
  try {
    return await write
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new ApiError("not_found", "No such Wallet")
    if (isUniqueViolation(error)) throw new ApiError("conflict", taken)
    throw error
  }
}

/**
 * Balance checks load on demand: a Wallet's checks, a date range, a page at a time. Rows are
 * ordered by date, then id, so `after` (the last row of the previous page) is a stable cursor.
 */
export function balanceCheckRoutes(db: Db) {
  const table = financesBalanceChecks

  async function cursorAfter(rowId: string, descending: boolean) {
    const [anchor] = await db
      .select({ date: table.date, id: table.id })
      .from(table)
      .where(eq(table.id, rowId))
    if (!anchor) throw new ApiError("validation_failed", "No such Balance check to page after")
    const beyond = descending ? lt : gt
    return or(
      beyond(table.date, anchor.date),
      and(eq(table.date, anchor.date), beyond(table.id, anchor.id)),
    )
  }

  return new Hono<AppEnv>()
    .post("/query", validate("json", balanceCheckQuery), async (c) => {
      const { ids, limit, after, walletId, dateFrom, dateTo, order } = c.req.valid("json")
      const descending = order === "dateDesc"
      const direction = descending ? desc : asc
      const checks = await db
        .select()
        .from(table)
        .where(
          and(
            ids ? inArray(table.id, ids) : undefined,
            walletId ? eq(table.walletId, walletId) : undefined,
            dateFrom ? gte(table.date, dateFrom) : undefined,
            dateTo ? lte(table.date, dateTo) : undefined,
            after ? await cursorAfter(after, descending) : undefined,
          ),
        )
        .orderBy(direction(table.date), direction(table.id))
        .limit(queryLimit(limit))
      return c.json({ rows: withinCap(checks, limit).map(toRow) })
    })
    .post("/", validate("json", createBalanceCheck), async (c) => {
      const input = c.req.valid("json")
      // One check per Wallet per date: a second one replaces the first's Amount, keeping its id.
      // An id that belongs to another check is a conflict, never an overwrite.
      const [check] = await checked(
        db
          .insert(table)
          .values(input)
          .onConflictDoUpdate({
            target: [table.walletId, table.date],
            set: { amountCents: input.amountCents, updatedAt: sql`now()` },
          })
          .returning(),
        "A Balance check with this id already exists",
      )
      if (!check) throw new Error("The Balance check upsert returned no row")
      return c.json(toRow(check), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateBalanceCheck), async (c) => {
      const [check] = await checked(
        db
          .update(table)
          .set({ ...c.req.valid("json"), updatedAt: sql`now()` })
          .where(eq(table.id, c.req.valid("param").id))
          .returning(),
        "This Wallet already has a Balance check on that date",
      )
      return check ? c.json(toRow(check)) : notFound()
    })
    .delete("/:id", validate("param", params), async (c) => {
      const [check] = await db
        .delete(table)
        .where(eq(table.id, c.req.valid("param").id))
        .returning()
      return check ? c.json(toRow(check)) : notFound()
    })
}

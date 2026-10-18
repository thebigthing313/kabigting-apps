import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isForeignKeyViolation } from "#server/apps/finances/db-errors.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesOccurrences, financesTransactions } from "#server/db/schema/index.ts"
import {
  createTransaction,
  isImported,
  transactionQuery,
  type TransactionRow,
  updateTransaction,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"
import { MAX_QUERY_IDS } from "#shared/schemas/query.ts"

type TransactionRecord = typeof financesTransactions.$inferSelect

function toRow(transaction: TransactionRecord): TransactionRow {
  return {
    id: transaction.id,
    status: transaction.status,
    walletId: transaction.walletId,
    date: transaction.date,
    amountCents: transaction.amountCents,
    accountId: transaction.accountId,
    categoryId: transaction.categoryId,
    note: transaction.note,
    bankDescription: transaction.bankDescription,
    source: transaction.source,
    ignored: transaction.ignored,
    reviewedAt: transaction.reviewedAt?.toISOString() ?? null,
    reconciledActualId: transaction.reconciledActualId,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  }
}

const params = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Transaction")
}

/** A missing Wallet, Account or Category is the caller's to fix, not a server fault. */
function reconciledConflict(): never {
  throw new ApiError("conflict", "Something is Reconciled to it; un-Reconcile it first")
}

function refusedLink(error: unknown): never {
  if (isForeignKeyViolation(error)) {
    throw new ApiError("validation_failed", "No such Wallet, Account or Category")
  }
  throw error
}

/**
 * Transactions load on demand: a Wallet's rows, a date range, a page at a time. Rows are ordered
 * by date, then id, so `after` (the last row of the previous page) is a stable cursor. Ignored
 * rows (imported Actuals a person deleted) are left out unless asked for.
 */
export function transactionRoutes(db: Db) {
  const table = financesTransactions

  async function cursorAfter(rowId: string, descending: boolean) {
    const [anchor] = await db
      .select({ date: table.date, id: table.id })
      .from(table)
      .where(eq(table.id, rowId))
    if (!anchor) throw new ApiError("validation_failed", "No such Transaction to page after")
    const beyond = descending ? lt : gt
    return or(
      beyond(table.date, anchor.date),
      and(eq(table.date, anchor.date), beyond(table.id, anchor.id)),
    )
  }

  return new Hono<AppEnv>()
    .post("/query", validate("json", transactionQuery), async (c) => {
      const filters = c.req.valid("json")
      const { ids, limit, after, walletId, dateFrom, dateTo, categoryId, status } = filters
      const descending = filters.order === "dateDesc"
      const direction = descending ? desc : asc
      const transactions = await db
        .select()
        .from(table)
        .where(
          and(
            ids ? inArray(table.id, ids) : undefined,
            walletId ? eq(table.walletId, walletId) : undefined,
            dateFrom ? gte(table.date, dateFrom) : undefined,
            dateTo ? lte(table.date, dateTo) : undefined,
            categoryId === undefined
              ? undefined
              : categoryId === null
                ? isNull(table.categoryId)
                : eq(table.categoryId, categoryId),
            status ? eq(table.status, status) : undefined,
            filters.unreviewed
              ? and(eq(table.status, "actual"), isNull(table.reviewedAt))
              : undefined,
            filters.includeIgnored ? undefined : eq(table.ignored, false),
            after ? await cursorAfter(after, descending) : undefined,
          ),
        )
        .orderBy(direction(table.date), direction(table.id))
        .limit(limit ?? MAX_QUERY_IDS)
      return c.json({ rows: transactions.map(toRow) })
    })
    .post("/", validate("json", createTransaction), async (c) => {
      const input = c.req.valid("json")
      const actual = input.status === "actual"
      // The client supplies the id; an existing id is a conflict, never an overwrite. A
      // hand-entered Actual is its own record, so it never waits in To review.
      const [transaction] = await db
        .insert(table)
        .values({
          ...input,
          source: actual ? "manual" : null,
          reviewedAt: actual ? sql`now()` : null,
        })
        .onConflictDoNothing({ target: table.id })
        .returning()
        .catch(refusedLink)
      if (!transaction) throw new ApiError("conflict", "A Transaction with this id already exists")
      return c.json(toRow(transaction), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateTransaction), async (c) => {
      const transactionId = c.req.valid("param").id
      const changes = c.req.valid("json")
      const [found] = await db.select().from(table).where(eq(table.id, transactionId))
      if (!found) notFound()
      if (isImported(found)) {
        const moved =
          (changes.amountCents !== undefined && changes.amountCents !== found.amountCents) ||
          (changes.date !== undefined && changes.date !== found.date) ||
          (changes.walletId !== undefined && changes.walletId !== found.walletId)
        if (moved) {
          throw new ApiError(
            "validation_failed",
            "An imported Actual keeps the amount, date and Wallet the bank gave it",
          )
        }
      }
      const [transaction] = await db
        .update(table)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(table.id, transactionId))
        .returning()
        .catch(refusedLink)
      return transaction ? c.json(toRow(transaction)) : notFound()
    })
    .delete("/:id", validate("param", params), async (c) => {
      const transactionId = c.req.valid("param").id
      const [found] = await db.select().from(table).where(eq(table.id, transactionId))
      if (!found) notFound()
      // An imported line is kept as ignored, so uploading the same file again adds nothing. Like a
      // deleted one, an ignored line can't stay the target of a Reconcile.
      if (isImported(found)) {
        const [occurrence] = await db
          .select({ id: financesOccurrences.id })
          .from(financesOccurrences)
          .where(eq(financesOccurrences.reconciledTransactionId, transactionId))
          .limit(1)
        const [planned] = await db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.reconciledActualId, transactionId))
          .limit(1)
        if (occurrence || planned) reconciledConflict()
        const [ignored] = await db
          .update(table)
          .set({ ignored: true, updatedAt: sql`now()` })
          .where(eq(table.id, transactionId))
          .returning()
        return ignored ? c.json(toRow(ignored)) : notFound()
      }
      const [deleted] = await db
        .delete(table)
        .where(eq(table.id, transactionId))
        .returning()
        .catch((error: unknown) => {
          if (isForeignKeyViolation(error)) reconciledConflict()
          throw error
        })
      return deleted ? c.json(toRow(deleted)) : notFound()
    })
}

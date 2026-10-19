import { and, asc, desc, eq, gt, gte, inArray, lt, lte, or, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isForeignKeyViolation } from "#server/apps/finances/db-errors.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { queryLimit, withinCap } from "#server/core/query-limit.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesOccurrences, financesTransfers } from "#server/db/schema/index.ts"
import {
  createTransfer,
  isImported,
  isImportedTransfer,
  transferQuery,
  type TransferRow,
  updateTransfer,
} from "#shared/finances/schemas.ts"
import { id } from "#shared/schemas/primitives.ts"

type TransferRecord = typeof financesTransfers.$inferSelect

export function transferToRow(transfer: TransferRecord): TransferRow {
  return {
    id: transfer.id,
    status: transfer.status,
    date: transfer.date,
    amountCents: transfer.amountCents,
    fromWalletId: transfer.fromWalletId,
    toWalletId: transfer.toWalletId,
    accountId: transfer.accountId,
    note: transfer.note,
    fromSource: transfer.fromSource,
    fromBankDescription: transfer.fromBankDescription,
    toSource: transfer.toSource,
    toBankDescription: transfer.toBankDescription,
    ignored: transfer.ignored,
    reconciledActualId: transfer.reconciledActualId,
    createdAt: transfer.createdAt.toISOString(),
    updatedAt: transfer.updatedAt.toISOString(),
  }
}

const params = z.strictObject({ id })

/** True when an Occurrence or a one-off Planned Transfer is Reconciled to this Actual Transfer. */
export async function isReconciledTransfer(
  db: Pick<Db, "select">,
  transferId: string,
): Promise<boolean> {
  const [occurrence] = await db
    .select({ id: financesOccurrences.id })
    .from(financesOccurrences)
    .where(eq(financesOccurrences.reconciledTransferId, transferId))
    .limit(1)
  const [planned] = await db
    .select({ id: financesTransfers.id })
    .from(financesTransfers)
    .where(eq(financesTransfers.reconciledActualId, transferId))
    .limit(1)
  return occurrence !== undefined || planned !== undefined
}

function notFound(): never {
  throw new ApiError("not_found", "No such Transfer")
}

function reconciledConflict(): never {
  throw new ApiError("conflict", "Something is Reconciled to it; un-Reconcile it first")
}

/** A missing Wallet or Account is the caller's to fix, not a server fault. */
function refusedLink(error: unknown): never {
  if (isForeignKeyViolation(error)) {
    throw new ApiError("validation_failed", "No such Wallet or Account")
  }
  throw error
}

/**
 * Transfers load on demand like Transactions. A Wallet's Transfers are those out of it and into
 * it. Rows are ordered by date, then id, so `after` is a stable cursor. Ignored rows are left out
 * unless asked for.
 */
export function transferRoutes(db: Db) {
  const table = financesTransfers

  async function cursorAfter(rowId: string, descending: boolean) {
    const [anchor] = await db
      .select({ date: table.date, id: table.id })
      .from(table)
      .where(eq(table.id, rowId))
    if (!anchor) throw new ApiError("validation_failed", "No such Transfer to page after")
    const beyond = descending ? lt : gt
    return or(
      beyond(table.date, anchor.date),
      and(eq(table.date, anchor.date), beyond(table.id, anchor.id)),
    )
  }

  return new Hono<AppEnv>()
    .post("/query", validate("json", transferQuery), async (c) => {
      const filters = c.req.valid("json")
      const { ids, limit, after, walletId, dateFrom, dateTo, status } = filters
      const descending = filters.order === "dateDesc"
      const direction = descending ? desc : asc
      const transfers = await db
        .select()
        .from(table)
        .where(
          and(
            ids ? inArray(table.id, ids) : undefined,
            walletId
              ? or(eq(table.fromWalletId, walletId), eq(table.toWalletId, walletId))
              : undefined,
            dateFrom ? gte(table.date, dateFrom) : undefined,
            dateTo ? lte(table.date, dateTo) : undefined,
            status ? eq(table.status, status) : undefined,
            filters.includeIgnored ? undefined : eq(table.ignored, false),
            after ? await cursorAfter(after, descending) : undefined,
          ),
        )
        .orderBy(direction(table.date), direction(table.id))
        .limit(queryLimit(limit))
      return c.json({ rows: withinCap(transfers, limit).map(transferToRow) })
    })
    .post("/", validate("json", createTransfer), async (c) => {
      const input = c.req.valid("json")
      // A hand-entered Actual Transfer came from a person on both sides; a Planned one from nowhere.
      const source = input.status === "actual" ? "manual" : null
      const [transfer] = await db
        .insert(table)
        .values({ ...input, fromSource: source, toSource: source })
        .onConflictDoNothing({ target: table.id })
        .returning()
        .catch(refusedLink)
      if (!transfer) throw new ApiError("conflict", "A Transfer with this id already exists")
      return c.json(transferToRow(transfer), 201)
    })
    .patch("/:id", validate("param", params), validate("json", updateTransfer), async (c) => {
      const transferId = c.req.valid("param").id
      const changes = c.req.valid("json")
      const [found] = await db.select().from(table).where(eq(table.id, transferId))
      if (!found) notFound()
      const changed = (key: "amountCents" | "date" | "fromWalletId" | "toWalletId") =>
        changes[key] !== undefined && changes[key] !== found[key]
      const fromWalletId = changes.fromWalletId ?? found.fromWalletId
      const toWalletId = changes.toWalletId ?? found.toWalletId
      if (fromWalletId === toWalletId) {
        throw new ApiError("validation_failed", "A Transfer goes to a different Wallet")
      }
      // A side that came from the bank keeps its Wallet, and the Transfer the amount and date the
      // bank gave it. A side still to arrive may be put on another Wallet.
      const locked =
        (isImportedTransfer(found) && (changed("amountCents") || changed("date"))) ||
        (isImported({ source: found.fromSource }) && changed("fromWalletId")) ||
        (isImported({ source: found.toSource }) && changed("toWalletId"))
      if (locked) {
        throw new ApiError(
          "validation_failed",
          "An imported Transfer keeps the amount, date and Wallet the bank gave it",
        )
      }
      // A Reconcile pairs Transfers between the same two Wallets; moving either side would split it.
      if (
        (changed("fromWalletId") || changed("toWalletId")) &&
        (found.reconciledActualId !== null || (await isReconciledTransfer(db, transferId)))
      ) {
        reconciledConflict()
      }
      const [transfer] = await db
        .update(table)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(table.id, transferId))
        .returning()
        .catch(refusedLink)
      return transfer ? c.json(transferToRow(transfer)) : notFound()
    })
    .delete("/:id", validate("param", params), async (c) => {
      const transferId = c.req.valid("param").id
      const [found] = await db.select().from(table).where(eq(table.id, transferId))
      if (!found) notFound()
      // An imported Transfer is kept as ignored, so uploading the same file again adds nothing.
      // Like a deleted one, an ignored Transfer can't stay the target of a Reconcile.
      if (isImportedTransfer(found)) {
        if (await isReconciledTransfer(db, transferId)) reconciledConflict()
        const [ignored] = await db
          .update(table)
          .set({ ignored: true, updatedAt: sql`now()` })
          .where(eq(table.id, transferId))
          .returning()
        return ignored ? c.json(transferToRow(ignored)) : notFound()
      }
      const [deleted] = await db
        .delete(table)
        .where(eq(table.id, transferId))
        .returning()
        .catch((error: unknown) => {
          if (isForeignKeyViolation(error)) reconciledConflict()
          throw error
        })
      return deleted ? c.json(transferToRow(deleted)) : notFound()
    })
}

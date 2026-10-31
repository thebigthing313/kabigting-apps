import { and, eq, isNull, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { isUniqueViolation } from "#server/db/errors.ts"
import { isReconciledActual } from "#server/apps/finances/transactions.ts"
import { transferToRow } from "#server/apps/finances/transfers.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import {
  financesTransactions,
  financesTransfers,
  financesWallets,
} from "#server/db/schema/index.ts"
import {
  MATCH_WINDOW_DAYS,
  suggestTransferHalf,
  TWIN_WINDOW_DAYS,
} from "#shared/finances/reconcile.ts"
import {
  isImported,
  markTransfer,
  pairTransfer,
  type ReconcileResult,
} from "#shared/finances/schemas.ts"
import {
  enteredByHand,
  onlySideArrived,
  sideOf,
  type TransferSide,
} from "#shared/finances/transfers.ts"
import { id } from "#shared/schemas/primitives.ts"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type TransactionRecord = typeof financesTransactions.$inferSelect

const params = z.strictObject({ id })

function invalid(message: string): never {
  throw new ApiError("validation_failed", message)
}

function conflict(message: string): never {
  throw new ApiError("conflict", message)
}

/** The columns of one side of a Transfer that a line from a Wallet fills: its source and key. */
export function sideColumns(
  side: TransferSide,
  line: Pick<TransactionRecord, "source" | "sourceKey" | "bankDescription">,
) {
  return side === "from"
    ? {
        fromSource: line.source,
        fromSourceKey: line.sourceKey,
        fromBankDescription: line.bankDescription,
      }
    : {
        toSource: line.source,
        toSourceKey: line.sourceKey,
        toBankDescription: line.bankDescription,
      }
}

async function lineForUpdate(tx: Tx, lineId: string): Promise<TransactionRecord> {
  const [line] = await tx
    .select()
    .from(financesTransactions)
    .where(eq(financesTransactions.id, lineId))
    .for("update")
  if (!line) throw new ApiError("not_found", "No such Actual")
  return line
}

/** Deleting a Reconciled Actual would leave its Planned item pointing at nothing. */
async function refuseReconciled(tx: Tx, line: TransactionRecord) {
  if (await isReconciledActual(tx, line.id)) {
    conflict("This Actual is Reconciled; un-Reconcile it first")
  }
}

/** Another line already holds that key on the side; a re-upload race, not a fault. */
function raced(error: unknown): never {
  if (isUniqueViolation(error)) conflict("That line is already one side of a Transfer")
  throw error
}

/** What a command changed: the line is gone, now one side of the Transfer. */
function lineJoined(
  lineId: string,
  transfer: typeof financesTransfers.$inferSelect,
): ReconcileResult {
  return {
    occurrences: [],
    deletedOccurrences: [],
    transactions: [],
    deletedTransactions: [lineId],
    transfers: [transferToRow(transfer)],
  }
}

/**
 * Transfer halves: a Transfer seen from both of its Wallets, such as a card payment in the
 * checking file and in the card file, stays one Transfer. Mark as Transfer turns an Actual into
 * one; pairing moves a Wallet's line onto its side, whether that side waits for the other
 * Wallet's line or the Transfer was entered by hand.
 */
export function transferHalfRoutes(db: Db) {
  return new Hono<AppEnv>()
    .post(
      "/transactions/:id/mark-transfer",
      validate("param", params),
      validate("json", markTransfer),
      async (c) => {
        const lineId = c.req.valid("param").id
        const { otherWalletId } = c.req.valid("json")
        const result = await db
          .transaction(async (tx): Promise<ReconcileResult> => {
            const line = await lineForUpdate(tx, lineId)
            if (line.status !== "actual") invalid("Only an Actual can be marked as a Transfer")
            if (line.ignored) invalid("An ignored line can't be a Transfer; restore it first")
            if (line.amountCents === 0) invalid("A Transfer moves a positive amount")
            if (otherWalletId === line.walletId) invalid("A Transfer goes to a different Wallet")
            const [other] = await tx
              .select({ id: financesWallets.id })
              .from(financesWallets)
              .where(eq(financesWallets.id, otherWalletId))
            if (!other) invalid("No such Wallet")
            await refuseReconciled(tx, line)

            // Money out of this Wallet went to the other; money in came from it.
            const side: TransferSide = line.amountCents < 0 ? "from" : "to"
            const wallets =
              side === "from"
                ? { fromWalletId: line.walletId, toWalletId: otherWalletId }
                : { fromWalletId: otherWalletId, toWalletId: line.walletId }
            const [made] = await tx
              .insert(financesTransfers)
              .values({
                status: "actual",
                date: line.date,
                amountCents: Math.abs(line.amountCents),
                ...wallets,
                accountId: line.accountId,
                note: line.note,
                // The Actual's side keeps where it came from (an uploaded line's key with it); the
                // other side stays empty, waiting for that Wallet's own line.
                ...sideColumns(side, line),
              })
              .returning()
            if (!made) throw new Error("Marking as a Transfer wrote nothing")
            await tx.delete(financesTransactions).where(eq(financesTransactions.id, line.id))
            return lineJoined(line.id, made)
          })
          .catch(raced)
        return c.json(result)
      },
    )
    .post(
      "/transfers/:id/pair",
      validate("param", params),
      validate("json", pairTransfer),
      async (c) => {
        const transferId = c.req.valid("param").id
        const { actualId } = c.req.valid("json")
        const result = await db
          .transaction(async (tx): Promise<ReconcileResult> => {
            const [transfer] = await tx
              .select()
              .from(financesTransfers)
              .where(eq(financesTransfers.id, transferId))
              .for("update")
            if (!transfer) throw new ApiError("not_found", "No such Transfer")
            const line = await lineForUpdate(tx, actualId)
            const byHand = enteredByHand(transfer)
            if (onlySideArrived(transfer) === null && !byHand) {
              invalid("This Transfer has no side waiting for a line")
            }
            if (line.status !== "actual" || !isImported(line) || line.ignored) {
              invalid("Only an uploaded line can be a side of a Transfer")
            }
            const side = sideOf(transfer, line.walletId)
            if (side === null || !suggestTransferHalf(line, [transfer])) {
              invalid(
                byHand
                  ? `Only a line in one of the Transfer's Wallets, moving it by the same amount the same way, within ${TWIN_WINDOW_DAYS} days, can be the same as a hand-entered Transfer`
                  : `Only a line in the Transfer's other Wallet, moving it by the same amount the same way, within ${MATCH_WINDOW_DAYS} days, can be its other side`,
              )
            }
            await refuseReconciled(tx, line)

            await tx.delete(financesTransactions).where(eq(financesTransactions.id, line.id))
            // The Transfer's amount and date stay; the line's labels fill only what is empty. A
            // side that already holds a key is never written over.
            const sideKey =
              side === "from" ? financesTransfers.fromSourceKey : financesTransfers.toSourceKey
            const [paired] = await tx
              .update(financesTransfers)
              .set({
                ...sideColumns(side, line),
                accountId: transfer.accountId ?? line.accountId,
                note: transfer.note || line.note,
                updatedAt: sql`now()`,
              })
              .where(and(eq(financesTransfers.id, transfer.id), isNull(sideKey)))
              .returning()
            if (!paired) conflict("That side of the Transfer already has its line")
            return lineJoined(line.id, paired)
          })
          .catch(raced)
        return c.json(result)
      },
    )
}

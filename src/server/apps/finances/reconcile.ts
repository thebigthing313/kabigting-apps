import { and, eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { isUniqueViolation } from "#server/apps/finances/db-errors.ts"
import { occurrenceToRow } from "#server/apps/finances/occurrences.ts"
import { isReconciledActual, transactionToRow } from "#server/apps/finances/transactions.ts"
import { isReconciledTransfer, transferToRow } from "#server/apps/finances/transfers.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import {
  financesOccurrences,
  financesSchedules,
  financesTransactions,
  financesTransfers,
} from "#server/db/schema/index.ts"
import { hasOverride, isOccurrenceDate, isReconciled } from "#shared/finances/occurrences.ts"
import {
  reconcile,
  type ReconcileResult,
  type TransactionRow,
  type TransferRow,
  unreconcile,
} from "#shared/finances/schemas.ts"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type TransactionRecord = typeof financesTransactions.$inferSelect
type TransferRecord = typeof financesTransfers.$inferSelect
type OccurrenceRecord = typeof financesOccurrences.$inferSelect

/** An Actual is a Transaction (a line on one Wallet) or a Transfer between two. */
type Actual =
  { kind: "transaction"; row: TransactionRecord } | { kind: "transfer"; row: TransferRecord }

/**
 * The Planned item found and locked, with how to link an Actual to it. A Planned Transaction
 * takes an Actual Transaction; a Planned Transfer takes an Actual Transfer.
 */
type Target =
  | {
      kind: "transaction"
      walletId: string
      categoryId: string | null
      link: (actualId: string) => Promise<Linked>
    }
  | {
      kind: "transfer"
      fromWalletId: string
      toWalletId: string
      accountId: string | null
      note: string
      link: (actualId: string) => Promise<Linked>
    }

/** The Planned rows a link changed. */
type Linked = {
  occurrences: OccurrenceRecord[]
  transactions: TransactionRow[]
  transfers: TransferRow[]
}

function invalid(message: string): never {
  throw new ApiError("validation_failed", message)
}

function conflict(message: string): never {
  throw new ApiError("conflict", message)
}

/** The Actual, in whichever table holds it, locked so it is Reconciled at most once. */
async function actualForUpdate(tx: Tx, actualId: string): Promise<Actual> {
  const [transaction] = await tx
    .select()
    .from(financesTransactions)
    .where(eq(financesTransactions.id, actualId))
    .for("update")
  if (transaction) return { kind: "transaction", row: transaction }
  const [transfer] = await tx
    .select()
    .from(financesTransfers)
    .where(eq(financesTransfers.id, actualId))
    .for("update")
  if (transfer) return { kind: "transfer", row: transfer }
  throw new ApiError("not_found", "No such Actual")
}

/** The Occurrence's Schedule and stored row, locked; refused unless it is outstanding. */
async function occurrenceTarget(
  tx: Tx,
  ref: { scheduleId: string; nominalDate: string },
): Promise<Target> {
  const [schedule] = await tx
    .select()
    .from(financesSchedules)
    .where(eq(financesSchedules.id, ref.scheduleId))
    .for("update")
  if (!schedule) throw new ApiError("not_found", "No such Schedule")
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
  if (stored && isReconciled(stored)) conflict("That Occurrence is already Reconciled")
  if (stored?.skipped) conflict("That Occurrence is skipped; unskip it first")

  const column = schedule.toWalletId === null ? "reconciledTransactionId" : "reconciledTransferId"
  async function link(actualId: string): Promise<Linked> {
    const [linked] = stored
      ? await tx
          .update(financesOccurrences)
          .set({ [column]: actualId, updatedAt: sql`now()` })
          .where(eq(financesOccurrences.id, stored.id))
          .returning()
      : await tx
          .insert(financesOccurrences)
          .values({ ...ref, [column]: actualId })
          .returning()
    if (!linked) throw new Error("Reconciling the Occurrence wrote nothing")
    return { occurrences: [linked], transactions: [], transfers: [] }
  }

  if (schedule.toWalletId === null) {
    return {
      kind: "transaction",
      walletId: schedule.walletId,
      categoryId: schedule.categoryId,
      link,
    }
  }
  return {
    kind: "transfer",
    fromWalletId: schedule.walletId,
    toWalletId: schedule.toWalletId,
    accountId: schedule.accountId,
    note: schedule.note,
    link,
  }
}

/** A one-off Planned Transaction, locked; refused unless it is outstanding. */
async function oneOffTarget(tx: Tx, plannedId: string): Promise<Target> {
  const [planned] = await tx
    .select()
    .from(financesTransactions)
    .where(eq(financesTransactions.id, plannedId))
    .for("update")
  if (!planned) throw new ApiError("not_found", "No such Planned Transaction")
  if (planned.status !== "planned") invalid("Reconcile an Actual to a Planned item")
  if (planned.reconciledActualId !== null) conflict("That Planned item is already Reconciled")
  return {
    kind: "transaction",
    walletId: planned.walletId,
    categoryId: planned.categoryId,
    link: async (actualId) => {
      const [linked] = await tx
        .update(financesTransactions)
        .set({ reconciledActualId: actualId, updatedAt: sql`now()` })
        .where(eq(financesTransactions.id, planned.id))
        .returning()
      if (!linked) throw new Error("Reconciling the Planned item wrote nothing")
      return { occurrences: [], transactions: [transactionToRow(linked)], transfers: [] }
    },
  }
}

/** A one-off Planned Transfer, locked; refused unless it is outstanding. */
async function plannedTransferTarget(tx: Tx, plannedId: string): Promise<Target> {
  const [planned] = await tx
    .select()
    .from(financesTransfers)
    .where(eq(financesTransfers.id, plannedId))
    .for("update")
  if (!planned) throw new ApiError("not_found", "No such Planned Transfer")
  if (planned.status !== "planned") invalid("Reconcile an Actual to a Planned item")
  if (planned.reconciledActualId !== null) conflict("That Planned item is already Reconciled")
  return {
    kind: "transfer",
    fromWalletId: planned.fromWalletId,
    toWalletId: planned.toWalletId,
    accountId: planned.accountId,
    note: planned.note,
    link: async (actualId) => {
      const [linked] = await tx
        .update(financesTransfers)
        .set({ reconciledActualId: actualId, updatedAt: sql`now()` })
        .where(eq(financesTransfers.id, planned.id))
        .returning()
      if (!linked) throw new Error("Reconciling the Planned item wrote nothing")
      return { occurrences: [], transactions: [], transfers: [transferToRow(linked)] }
    },
  }
}

/**
 * Turns a bank line into the Actual Transfer the Planned one foresaw: the line's key moves to the
 * side of its Wallet, the other side waits for its own line, and the Transaction row goes.
 */
async function lineToTransfer(
  tx: Tx,
  line: TransactionRecord,
  target: Extract<Target, { kind: "transfer" }>,
): Promise<TransferRecord> {
  const side =
    line.walletId === target.fromWalletId
      ? "from"
      : line.walletId === target.toWalletId
        ? "to"
        : invalid("Reconcile within one Wallet")
  // Money leaves the from Wallet and reaches the to Wallet.
  if ((side === "from") !== line.amountCents < 0) {
    invalid("This line moves money the other way from the Planned Transfer")
  }
  const keyed = {
    source: line.source,
    sourceKey: line.sourceKey,
    bankDescription: line.bankDescription,
  }
  const [made] = await tx
    .insert(financesTransfers)
    .values({
      status: "actual",
      date: line.date,
      amountCents: Math.abs(line.amountCents),
      fromWalletId: target.fromWalletId,
      toWalletId: target.toWalletId,
      accountId: line.accountId ?? target.accountId,
      note: line.note || target.note,
      ...(side === "from"
        ? {
            fromSource: keyed.source,
            fromSourceKey: keyed.sourceKey,
            fromBankDescription: keyed.bankDescription,
          }
        : {
            toSource: keyed.source,
            toSourceKey: keyed.sourceKey,
            toBankDescription: keyed.bankDescription,
          }),
    })
    .returning()
  if (!made) throw new Error("Making the Actual Transfer wrote nothing")
  await tx.delete(financesTransactions).where(eq(financesTransactions.id, line.id))
  return made
}

/** Reconciles the Actual to the Planned item; returns every row it changed. */
async function reconcileTo(tx: Tx, actual: Actual, target: Target): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    occurrences: [],
    deletedOccurrences: [],
    transactions: [],
    deletedTransactions: [],
    transfers: [],
  }
  const add = (linked: Linked) => {
    result.occurrences.push(...linked.occurrences.map(occurrenceToRow))
    result.transactions.push(...linked.transactions)
    result.transfers.push(...linked.transfers)
  }

  if (target.kind === "transaction") {
    if (actual.kind === "transfer")
      invalid("An Actual Transfer is Reconciled to a Planned Transfer")
    if (actual.row.walletId !== target.walletId) invalid("Reconcile within one Wallet")
    add(await target.link(actual.row.id))
    // A person confirmed it, so it no longer waits in To review. It takes the Planned item's
    // Category only when it has none of its own.
    const [updated] = await tx
      .update(financesTransactions)
      .set({
        reviewedAt: sql`coalesce(${financesTransactions.reviewedAt}, now())`,
        categoryId: actual.row.categoryId ?? target.categoryId,
        updatedAt: sql`now()`,
      })
      .where(eq(financesTransactions.id, actual.row.id))
      .returning()
    if (!updated) throw new Error("Reconciling the Actual wrote nothing")
    result.transactions.push(transactionToRow(updated))
    return result
  }

  if (actual.kind === "transfer") {
    const sameWallets =
      actual.row.fromWalletId === target.fromWalletId && actual.row.toWalletId === target.toWalletId
    if (!sameWallets) invalid("Reconcile a Transfer between the same two Wallets, the same way")
    add(await target.link(actual.row.id))
    return result
  }

  const made = await lineToTransfer(tx, actual.row, target)
  add(await target.link(made.id))
  result.transfers.push(transferToRow(made))
  result.deletedTransactions.push(actual.row.id)
  return result
}

/** Two people Reconciling the same unstored Occurrence at once: the second is refused. */
function raced(error: unknown): never {
  if (isUniqueViolation(error)) conflict("That was Reconciled just now")
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
          if (actual.row.status !== "actual") invalid("Reconcile an Actual to a Planned item")
          if (actual.row.ignored) invalid("An ignored line can't be Reconciled; restore it first")
          const reconciled =
            actual.kind === "transaction"
              ? await isReconciledActual(tx, actual.row.id)
              : await isReconciledTransfer(tx, actual.row.id)
          if (reconciled) conflict("This Actual is already Reconciled; un-Reconcile it first")

          const target =
            body.plannedKind === "occurrence"
              ? await occurrenceTarget(tx, body.plannedRef)
              : body.plannedKind === "transaction"
                ? await oneOffTarget(tx, body.plannedRef)
                : await plannedTransferTarget(tx, body.plannedRef)
          return reconcileTo(tx, actual, target)
        })
        .catch(raced)
      return c.json(result)
    })
    .post("/unreconcile", validate("json", unreconcile), async (c) => {
      const { actualId } = c.req.valid("json")
      const result = await db.transaction(async (tx): Promise<ReconcileResult> => {
        const actual = await actualForUpdate(tx, actualId)
        const changed: ReconcileResult = {
          occurrences: [],
          deletedOccurrences: [],
          transactions: [],
          deletedTransactions: [],
          transfers: [],
        }
        const column =
          actual.kind === "transaction" ? "reconciledTransactionId" : "reconciledTransferId"

        const [occurrence] = await tx
          .select()
          .from(financesOccurrences)
          .where(eq(financesOccurrences[column], actualId))
          .for("update")
        if (occurrence) {
          if (hasOverride(occurrence)) {
            // Back to outstanding with the override it had before.
            const [unlinked] = await tx
              .update(financesOccurrences)
              .set({ [column]: null, updatedAt: sql`now()` })
              .where(eq(financesOccurrences.id, occurrence.id))
              .returning()
            if (unlinked) changed.occurrences.push(occurrenceToRow(unlinked))
          } else {
            // Stored only for the link, so it is computed from its Schedule again.
            await tx.delete(financesOccurrences).where(eq(financesOccurrences.id, occurrence.id))
            changed.deletedOccurrences.push(occurrence.id)
          }
        }

        if (actual.kind === "transaction") {
          const unlinked = await tx
            .update(financesTransactions)
            .set({ reconciledActualId: null, updatedAt: sql`now()` })
            .where(eq(financesTransactions.reconciledActualId, actualId))
            .returning()
          changed.transactions.push(...unlinked.map(transactionToRow))
        } else {
          const unlinked = await tx
            .update(financesTransfers)
            .set({ reconciledActualId: null, updatedAt: sql`now()` })
            .where(eq(financesTransfers.reconciledActualId, actualId))
            .returning()
          changed.transfers.push(...unlinked.map(transferToRow))
        }

        const nothing = !occurrence && changed.transactions.length + changed.transfers.length === 0
        if (nothing) conflict("This Actual isn't Reconciled")
        return changed
      })
      return c.json(result)
    })
}

import { desc, eq, sql, type SQL } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { accountsInSplit, type Tx } from "#server/apps/split/members.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { splitPayments } from "#server/db/schema/index.ts"
import { id } from "#shared/schemas/primitives.ts"
import { editPaymentAllowed, newPaymentAllowed, paymentProblems } from "#shared/split/rules.ts"
import {
  createPayment,
  updatePayment,
  type PaymentRow,
  type UpdatePayment,
} from "#shared/split/schemas.ts"

/** The Payments matching `where` as wire rows, newest first. */
async function readPayments(db: Db | Tx, where?: SQL): Promise<PaymentRow[]> {
  const payments = await db
    .select()
    .from(splitPayments)
    .where(where)
    .orderBy(desc(splitPayments.date), desc(splitPayments.addedAt), desc(splitPayments.id))
  return payments.map((payment) => ({
    id: payment.id,
    date: payment.date,
    fromId: payment.fromId,
    toId: payment.toId,
    amount: payment.amountCents,
    note: payment.note,
    addedBy: payment.addedById,
    addedAt: payment.addedAt.toISOString(),
    changedBy: payment.changedById,
    changedAt: payment.changedAt.toISOString(),
  }))
}

const params = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Payment")
}

/** Refuses a Payment the Split rules block, naming every field that blocks it. */
function checkForSave(input: UpdatePayment, allowed: ReadonlySet<string>): void {
  const problems = paymentProblems(input, allowed)
  if (problems.length > 0) {
    throw new ApiError(
      "validation_failed",
      "The Payment is not valid",
      problems.map(({ field, message }) => ({ path: field, message })),
    )
  }
}

/** The columns a Payment's input sets, as stored. */
function storedFields(input: UpdatePayment) {
  return {
    date: input.date,
    fromId: input.fromId,
    toId: input.toId,
    amountCents: input.amount,
    note: input.note.trim(),
  }
}

/** The saved Payment, locked until the transaction ends so no other save or delete interleaves. */
async function lockedPayment(tx: Tx, paymentId: string): Promise<PaymentRow | undefined> {
  const [locked] = await tx
    .select({ id: splitPayments.id })
    .from(splitPayments)
    .where(eq(splitPayments.id, paymentId))
    .for("update")
  if (!locked) return undefined
  const [saved] = await readPayments(tx, eq(splitPayments.id, paymentId))
  return saved
}

/**
 * Payments, shared by every Member: any Member can change or delete any of them. Each is a
 * positive Amount from one Member or Former member to a different one, checked with the same
 * rules as the form.
 */
export function paymentRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json({ rows: await readPayments(db) }))
    .post("/", validate("json", createPayment), async (c) => {
      const input = c.req.valid("json")
      const accountId = c.get("account").id
      await db.transaction(async (tx) => {
        // The Members and Former members as of this save can be on a new Payment, so a Former
        // member's Balance can be settled to zero.
        checkForSave(input, newPaymentAllowed(await accountsInSplit(tx)))
        // The client supplies the id; an id already in use is a conflict, never an overwrite.
        const [inserted] = await tx
          .insert(splitPayments)
          .values({
            id: input.id,
            ...storedFields(input),
            addedById: accountId,
            changedById: accountId,
          })
          .onConflictDoNothing({ target: splitPayments.id })
          .returning({ id: splitPayments.id })
        if (!inserted) throw new ApiError("conflict", "A Payment with this id already exists")
      })
      const [row] = await readPayments(db, eq(splitPayments.id, input.id))
      return row ? c.json(row, 201) : notFound()
    })
    .put("/:id", validate("param", params), validate("json", updatePayment), async (c) => {
      // Replaces the whole Payment and records who changed it and when. The last save wins; one
      // that is gone stays gone.
      const paymentId = c.req.valid("param").id
      const input = c.req.valid("json")
      const accountId = c.get("account").id
      const row = await db.transaction(async (tx) => {
        const saved = (await lockedPayment(tx, paymentId)) ?? notFound()
        // Whoever is already on it stays allowed; nobody else outside Split can be added.
        checkForSave(input, editPaymentAllowed(await accountsInSplit(tx), saved))
        await tx
          .update(splitPayments)
          .set({ ...storedFields(input), changedById: accountId, changedAt: sql`now()` })
          .where(eq(splitPayments.id, paymentId))
        // Read under the lock, so a delete right after the commit can't turn this save into 404.
        const [stored] = await readPayments(tx, eq(splitPayments.id, paymentId))
        return stored ?? notFound()
      })
      return c.json(row)
    })
    .delete("/:id", validate("param", params), async (c) => {
      // Permanent: there is no trash. The deleted row is the answer.
      const paymentId = c.req.valid("param").id
      const deleted = await db.transaction(async (tx) => {
        const saved = (await lockedPayment(tx, paymentId)) ?? notFound()
        await tx.delete(splitPayments).where(eq(splitPayments.id, paymentId))
        return saved
      })
      return c.json(deleted)
    })
}

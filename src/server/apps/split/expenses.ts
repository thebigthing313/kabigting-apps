import { and, desc, eq, inArray, type SQL } from "drizzle-orm"
import { Hono } from "hono"
import { currentMembers } from "#server/apps/split/members.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { splitCategories, splitExpenses, splitShares } from "#server/db/schema/index.ts"
import { resolveExpense } from "#shared/split/rules.ts"
import { createExpense, type ExpenseRow, type Shares } from "#shared/split/schemas.ts"

/** The Expenses matching `where` as wire rows, newest first. */
async function readExpenses(db: Db, where?: SQL): Promise<ExpenseRow[]> {
  const expenses = await db
    .select()
    .from(splitExpenses)
    .where(where)
    .orderBy(desc(splitExpenses.date), desc(splitExpenses.addedAt), desc(splitExpenses.id))
  if (expenses.length === 0) return []
  const shares = await db
    .select()
    .from(splitShares)
    .where(
      inArray(
        splitShares.expenseId,
        expenses.map((expense) => expense.id),
      ),
    )
  const sides = new Map<string, { paid: Shares; owed: Shares }>()
  for (const share of shares) {
    const of = sides.get(share.expenseId) ?? { paid: {}, owed: {} }
    of[share.side][share.accountId] = share.cents
    sides.set(share.expenseId, of)
  }
  return expenses.map((expense) => ({
    id: expense.id,
    description: expense.description,
    date: expense.date,
    categoryId: expense.categoryId,
    total: expense.totalCents,
    note: expense.note,
    paid: expense.paid,
    owed: expense.owed,
    paidShares: sides.get(expense.id)?.paid ?? {},
    owedShares: sides.get(expense.id)?.owed ?? {},
    addedBy: expense.addedById,
    addedAt: expense.addedAt.toISOString(),
    changedBy: expense.changedById,
    changedAt: expense.changedAt.toISOString(),
  }))
}

function shareRows(expenseId: string, side: "paid" | "owed", shares: Shares) {
  return Object.entries(shares).map(([accountId, cents]) => ({ expenseId, side, accountId, cents }))
}

/**
 * Expenses, shared by every Member. The server works out the shares itself from each side, with
 * the same rules as the form, so what is stored always adds up.
 */
export function expenseRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json({ rows: await readExpenses(db) }))
    .post("/", validate("json", createExpense), async (c) => {
      const input = c.req.valid("json")
      const accountId = c.get("account").id
      await db.transaction(async (tx) => {
        // Only the Members as of this save can be on a new Expense.
        const members = await currentMembers(tx)
        const resolved = resolveExpense(
          input,
          members.map((member) => member.id),
        )
        if (!resolved.ok) {
          throw new ApiError(
            "validation_failed",
            "The Expense is not valid",
            resolved.problems.map(({ field, message }) => ({ path: field, message })),
          )
        }
        const [category] = await tx
          .select({ id: splitCategories.id })
          .from(splitCategories)
          .where(and(eq(splitCategories.id, input.categoryId), eq(splitCategories.archived, false)))
        if (!category) {
          throw new ApiError("validation_failed", "The Expense is not valid", [
            { path: "categoryId", message: "Pick a Category" },
          ])
        }
        // The client supplies the id; an id already in use is a conflict, never an overwrite.
        const [inserted] = await tx
          .insert(splitExpenses)
          .values({
            id: input.id,
            description: input.description.trim(),
            date: input.date,
            totalCents: input.total,
            categoryId: input.categoryId,
            note: input.note.trim(),
            paid: input.paid,
            owed: input.owed,
            addedById: accountId,
            changedById: accountId,
          })
          .onConflictDoNothing({ target: splitExpenses.id })
          .returning({ id: splitExpenses.id })
        if (!inserted) throw new ApiError("conflict", "An Expense with this id already exists")
        await tx
          .insert(splitShares)
          .values([
            ...shareRows(input.id, "paid", resolved.paidShares),
            ...shareRows(input.id, "owed", resolved.owedShares),
          ])
      })
      const [row] = await readExpenses(db, eq(splitExpenses.id, input.id))
      if (!row) throw new ApiError("not_found", "No such Expense")
      return c.json(row, 201)
    })
}

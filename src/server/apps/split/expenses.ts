import { and, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import { currentMembers, oldestFirst, type Tx } from "#server/apps/split/members.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { splitCategories, splitExpenses, splitShares } from "#server/db/schema/index.ts"
import { id } from "#shared/schemas/primitives.ts"
import {
  accountsOnExpense,
  editExpenseRoster,
  newExpenseRoster,
  resolveExpense,
  type Roster,
} from "#shared/split/rules.ts"
import {
  createExpense,
  updateExpense,
  type ExpenseRow,
  type Shares,
  type UpdateExpense,
} from "#shared/split/schemas.ts"

/** The Expenses matching `where` as wire rows, newest first. */
async function readExpenses(db: Db | Tx, where?: SQL): Promise<ExpenseRow[]> {
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
    imported: expense.imported,
  }))
}

const params = z.strictObject({ id })

function notFound(): never {
  throw new ApiError("not_found", "No such Expense")
}

function shareRows(expenseId: string, side: "paid" | "owed", shares: Shares) {
  return Object.entries(shares).map(([accountId, cents]) => ({ expenseId, side, accountId, cents }))
}

/**
 * The shares `input` resolves to among `roster`, or a refusal naming every field that blocks the
 * save. The Category must be one not archived, unless it is `keptCategoryId`: an edited Expense
 * may keep the Category it already has.
 */
async function resolveForSave(
  tx: Tx,
  input: UpdateExpense,
  roster: Roster,
  keptCategoryId?: string,
): Promise<{ paidShares: Shares; owedShares: Shares }> {
  const resolved = resolveExpense(input, roster)
  const offered = eq(splitCategories.archived, false)
  const [category] = await tx
    .select({ id: splitCategories.id })
    .from(splitCategories)
    .where(
      and(
        eq(splitCategories.id, input.categoryId),
        keptCategoryId === undefined
          ? offered
          : or(offered, eq(splitCategories.id, keptCategoryId)),
      ),
    )
  const problems = [
    ...(resolved.ok ? [] : resolved.problems),
    ...(category ? [] : [{ field: "categoryId", message: "Pick a Category" }]),
  ]
  if (!resolved.ok || problems.length > 0) {
    throw new ApiError(
      "validation_failed",
      "The Expense is not valid",
      problems.map(({ field, message }) => ({ path: field, message })),
    )
  }
  return resolved
}

/** The columns an Expense's input sets, as stored. */
function storedFields(input: UpdateExpense) {
  return {
    description: input.description.trim(),
    date: input.date,
    totalCents: input.total,
    categoryId: input.categoryId,
    note: input.note.trim(),
    paid: input.paid,
    owed: input.owed,
  }
}

async function insertShares(
  tx: Tx,
  expenseId: string,
  { paidShares, owedShares }: { paidShares: Shares; owedShares: Shares },
) {
  await tx
    .insert(splitShares)
    .values([
      ...shareRows(expenseId, "paid", paidShares),
      ...shareRows(expenseId, "owed", owedShares),
    ])
}

/** The saved Expense, locked until the transaction ends so no other save or delete interleaves. */
async function lockedExpense(tx: Tx, expenseId: string): Promise<ExpenseRow | undefined> {
  const [locked] = await tx
    .select({ id: splitExpenses.id })
    .from(splitExpenses)
    .where(eq(splitExpenses.id, expenseId))
    .for("update")
  if (!locked) return undefined
  const [saved] = await readExpenses(tx, eq(splitExpenses.id, expenseId))
  return saved
}

/**
 * Who can be on an edited Expense: the Members as of this save, plus everyone already on it,
 * Former members included, so their shares stay editable and removable.
 */
async function editRoster(tx: Tx, saved: ExpenseRow): Promise<Roster> {
  const members = (await currentMembers(tx)).map((member) => member.id)
  const everyone = new Set([...members, ...accountsOnExpense(saved)])
  return editExpenseRoster(await oldestFirst(tx, [...everyone]), members, saved)
}

/**
 * Expenses, shared by every Member: any Member can change or delete any of them. The server works
 * out the shares itself from each side, with the same rules as the form, so what is stored always
 * adds up.
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
        const roster = newExpenseRoster(members.map((member) => member.id))
        const resolved = await resolveForSave(tx, input, roster)
        // The client supplies the id; an id already in use is a conflict, never an overwrite.
        const [inserted] = await tx
          .insert(splitExpenses)
          .values({
            id: input.id,
            ...storedFields(input),
            addedById: accountId,
            changedById: accountId,
          })
          .onConflictDoNothing({ target: splitExpenses.id })
          .returning({ id: splitExpenses.id })
        if (!inserted) throw new ApiError("conflict", "An Expense with this id already exists")
        await insertShares(tx, input.id, resolved)
      })
      const [row] = await readExpenses(db, eq(splitExpenses.id, input.id))
      return row ? c.json(row, 201) : notFound()
    })
    .put("/:id", validate("param", params), validate("json", updateExpense), async (c) => {
      // Replaces the whole Expense, both sides and every share, and records who changed it and
      // when. The last save wins; one that is gone stays gone.
      const expenseId = c.req.valid("param").id
      const input = c.req.valid("json")
      const accountId = c.get("account").id
      const row = await db.transaction(async (tx) => {
        const saved = (await lockedExpense(tx, expenseId)) ?? notFound()
        const roster = await editRoster(tx, saved)
        const resolved = await resolveForSave(tx, input, roster, saved.categoryId)
        await tx
          .update(splitExpenses)
          .set({ ...storedFields(input), changedById: accountId, changedAt: sql`now()` })
          .where(eq(splitExpenses.id, expenseId))
        await tx.delete(splitShares).where(eq(splitShares.expenseId, expenseId))
        await insertShares(tx, expenseId, resolved)
        // Read under the lock, so a delete right after the commit can't turn this save into 404.
        const [stored] = await readExpenses(tx, eq(splitExpenses.id, expenseId))
        return stored ?? notFound()
      })
      return c.json(row)
    })
    .delete("/:id", validate("param", params), async (c) => {
      // Permanent: there is no trash. Its shares go with it; the deleted row is the answer.
      const expenseId = c.req.valid("param").id
      const deleted = await db.transaction(async (tx) => {
        const saved = (await lockedExpense(tx, expenseId)) ?? notFound()
        await tx.delete(splitExpenses).where(eq(splitExpenses.id, expenseId))
        return saved
      })
      return c.json(deleted)
    })
}

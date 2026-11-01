/**
 * Writes an import plan in one database transaction. It refuses when Split already holds data,
 * unless told to wipe it first; the twelve seeded Categories do not count as data. Every row is
 * marked imported, with the Admin as who added and changed it, and Splitwise's own times as when.
 */
import { and, asc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm"
import type { Tx } from "#server/apps/split/members.ts"
import type { Db } from "#server/db/client.ts"
import {
  auth_user,
  splitCategories,
  splitExpenses,
  splitPayments,
  splitShares,
} from "#server/db/schema/index.ts"
import { instantToDate } from "#shared/dates.ts"
import { newId } from "#shared/ids.ts"
import { SEEDED_CATEGORY_NAMES } from "#shared/split/categories.ts"
import type { Shares } from "#shared/split/schemas.ts"
import type { ImportPlan } from "./plan.ts"

/** Rows per insert statement, well under Postgres's parameter limit. */
const CHUNK = 500

export class ImportRefused extends Error {}

export type WrittenCounts = { expenses: number; shares: number; payments: number }

const SEEDED = SEEDED_CATEGORY_NAMES.map((name) => name.toLowerCase())
const seededName = sql`lower(${splitCategories.name})`

/** What Split already holds that the import would replace; none means it may import. */
export async function splitHolds(db: Db | Tx): Promise<string[]> {
  const one = { one: sql`1` }
  const checks = [
    ["Expenses", db.select(one).from(splitExpenses).limit(1)],
    ["Payments", db.select(one).from(splitPayments).limit(1)],
    [
      "Categories beyond the seeded twelve",
      db.select(one).from(splitCategories).where(notInArray(seededName, SEEDED)).limit(1),
    ],
  ] as const
  const found: string[] = []
  for (const [name, query] of checks) if ((await query).length > 0) found.push(name)
  return found
}

async function insertChunked<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown[]>) {
  let written = 0
  for (let start = 0; start < rows.length; start += CHUNK) {
    written += (await insert(rows.slice(start, start + CHUNK))).length
  }
  return written
}

/** The Admin, oldest first if there were ever more than one, and not a Removed Account. */
async function importer(tx: Tx): Promise<string> {
  const [admin] = await tx
    .select({ id: auth_user.id })
    .from(auth_user)
    .where(
      and(eq(auth_user.role, "admin"), or(isNull(auth_user.banned), eq(auth_user.banned, false))),
    )
    .orderBy(asc(auth_user.createdAt), asc(auth_user.id))
    .limit(1)
  if (!admin) throw new ImportRefused("There is no Admin Account to record the import under.")
  return admin.id
}

/**
 * Each Category the plan uses, by name regardless of case, or a refusal naming the ones missing:
 * a Member may have renamed a seeded Category. The names come from the committed Category table.
 */
async function categoryIdsFor(tx: Tx, plan: ImportPlan): Promise<Map<string, string>> {
  const ids = new Map(
    (await tx.select().from(splitCategories)).map((category) => [
      category.name.toLowerCase(),
      category.id,
    ]),
  )
  const wanted = [...new Set(plan.expenses.map((expense) => expense.category))]
  const missing = wanted.filter((name) => !ids.has(name.toLowerCase()))
  if (missing.length > 0) {
    throw new ImportRefused(
      `Split has no Category named ${missing.join(", ")}; a seeded Category may have been renamed. Rename it back and run again.`,
    )
  }
  return ids
}

function shareRows(expenseId: string, side: "paid" | "owed", shares: Shares) {
  return Object.entries(shares).map(([accountId, cents]) => ({ expenseId, side, accountId, cents }))
}

/** Who and when, for a row added in Splitwise: the Admin, at Splitwise's own times. */
function authorship(adminId: string, entry: { addedAt: string; changedAt: string }) {
  return {
    addedById: adminId,
    addedAt: instantToDate(entry.addedAt),
    changedById: adminId,
    changedAt: instantToDate(entry.changedAt),
    imported: true,
  }
}

export async function writeImport(
  db: Db,
  plan: ImportPlan,
  options: { wipe: boolean },
): Promise<WrittenCounts> {
  return db.transaction(async (tx) => {
    const holding = await splitHolds(tx)
    if (holding.length > 0 && !options.wipe) {
      throw new ImportRefused(
        `Split already holds data (${holding.join(", ")}). Run with --wipe to clear it first.`,
      )
    }
    // Checked before anything is deleted, so a refusal here changes nothing.
    const adminId = await importer(tx)
    const categoryIds = await categoryIdsFor(tx, plan)
    if (options.wipe) {
      // Shares go with their Expense. The seeded twelve stay, all of them in use again.
      await tx.delete(splitExpenses)
      await tx.delete(splitPayments)
      await tx.delete(splitCategories).where(notInArray(seededName, SEEDED))
      await tx
        .update(splitCategories)
        .set({ archived: false, updatedAt: new Date() })
        .where(and(inArray(seededName, SEEDED), eq(splitCategories.archived, true)))
    }

    // Splitwise lists newest first; ids are UUIDv7, so writing oldest first makes the newest row
    // the last written, as it would have been had it been entered here.
    const expenses = plan.expenses.toReversed().map((expense) => ({
      id: newId(),
      categoryId: categoryIds.get(expense.category.toLowerCase()) ?? "",
      expense,
    }))
    const writtenExpenses = await insertChunked(expenses, (chunk) =>
      tx
        .insert(splitExpenses)
        .values(
          chunk.map(({ id, categoryId, expense }) => ({
            id,
            description: expense.description,
            date: expense.date,
            totalCents: expense.total,
            categoryId,
            note: expense.note,
            paid: expense.paid,
            owed: expense.owed,
            ...authorship(adminId, expense),
          })),
        )
        .returning({ id: splitExpenses.id }),
    )
    const shares = expenses.flatMap(({ id, expense }) => [
      ...shareRows(id, "paid", expense.paidShares),
      ...shareRows(id, "owed", expense.owedShares),
    ])
    const writtenShares = await insertChunked(shares, (chunk) =>
      tx.insert(splitShares).values(chunk).returning({ id: splitShares.expenseId }),
    )
    const writtenPayments = await insertChunked(plan.payments.toReversed(), (chunk) =>
      tx
        .insert(splitPayments)
        .values(
          chunk.map((payment) => ({
            id: newId(),
            date: payment.date,
            fromId: payment.fromId,
            toId: payment.toId,
            amountCents: payment.amount,
            note: "",
            ...authorship(adminId, payment),
          })),
        )
        .returning({ id: splitPayments.id }),
    )

    const written = { expenses: writtenExpenses, shares: writtenShares, payments: writtenPayments }
    const expected = {
      expenses: expenses.length,
      shares: shares.length,
      payments: plan.payments.length,
    }
    if (JSON.stringify(written) !== JSON.stringify(expected)) {
      // Throwing rolls the whole transaction back.
      throw new ImportRefused(
        `Rows written differ from the plan: ${JSON.stringify(written)} ≠ ${JSON.stringify(expected)}`,
      )
    }
    return written
  })
}

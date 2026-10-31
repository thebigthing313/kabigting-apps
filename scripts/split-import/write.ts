/**
 * Writes an import plan in one database transaction. It refuses when Split already holds data,
 * unless told to wipe it first; the twelve seeded Categories do not count as data. Every row is
 * marked imported, with the Admin as who added it and the run's time as when.
 */
import { and, asc, eq, isNull, notInArray, or, sql } from "drizzle-orm"
import type { Db } from "#server/db/client.ts"
import {
  auth_user,
  splitCategories,
  splitExpenses,
  splitPayments,
  splitShares,
} from "#server/db/schema/index.ts"
import { newId } from "#shared/ids.ts"
import { SEEDED_CATEGORY_NAMES } from "#shared/split/categories.ts"
import type { Shares } from "#shared/split/schemas.ts"
import type { ImportPlan } from "./plan.ts"

/** Rows per insert statement, well under Postgres's parameter limit. */
const CHUNK = 500

export class ImportRefused extends Error {}

export type WrittenCounts = { expenses: number; shares: number; payments: number }

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

const SEEDED = SEEDED_CATEGORY_NAMES.map((name) => name.toLowerCase())
const notSeeded = notInArray(sql`lower(${splitCategories.name})`, SEEDED)

async function holdsRows(tx: Tx): Promise<string[]> {
  const found: string[] = []
  const checks = [
    [
      "Expenses",
      tx
        .select({ one: sql`1` })
        .from(splitExpenses)
        .limit(1),
    ],
    [
      "Payments",
      tx
        .select({ one: sql`1` })
        .from(splitPayments)
        .limit(1),
    ],
    [
      "Categories beyond the seeded twelve",
      tx
        .select({ one: sql`1` })
        .from(splitCategories)
        .where(notSeeded)
        .limit(1),
    ],
  ] as const
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

function shareRows(expenseId: string, side: "paid" | "owed", shares: Shares) {
  return Object.entries(shares).map(([accountId, cents]) => ({ expenseId, side, accountId, cents }))
}

export async function writeImport(
  db: Db,
  plan: ImportPlan,
  options: { wipe: boolean; now: Date },
): Promise<WrittenCounts> {
  return db.transaction(async (tx) => {
    const holding = await holdsRows(tx)
    if (holding.length > 0 && !options.wipe) {
      throw new ImportRefused(
        `Split already holds data (${holding.join(", ")}). Run with --wipe to clear it first.`,
      )
    }
    if (options.wipe) {
      // Shares go with their Expense.
      await tx.delete(splitExpenses)
      await tx.delete(splitPayments)
      await tx.delete(splitCategories).where(notSeeded)
    }

    const adminId = await importer(tx)
    const categoryIds = new Map(
      (await tx.select().from(splitCategories)).map((category) => [
        category.name.toLowerCase(),
        category.id,
      ]),
    )
    const authorship = {
      addedById: adminId,
      addedAt: options.now,
      changedById: adminId,
      changedAt: options.now,
      imported: true,
    }

    // Splitwise lists newest first; ids are UUIDv7, so writing oldest first makes the newest row
    // the last written, as it would have been had it been entered here.
    const expenses = plan.expenses.toReversed().map((expense) => {
      const categoryId = categoryIds.get(expense.category.toLowerCase())
      if (categoryId === undefined) {
        throw new ImportRefused(`The Category ${expense.category} is missing from Split.`)
      }
      return { id: newId(), categoryId, expense }
    })
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
            ...authorship,
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
            ...authorship,
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
      throw new Error(
        `Rows written differ from the plan: ${JSON.stringify(written)} ≠ ${JSON.stringify(expected)}`,
      )
    }
    return written
  })
}

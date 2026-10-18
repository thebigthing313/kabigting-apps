/**
 * Writes an import plan in one database transaction. It refuses when Finances already holds data,
 * unless told to wipe it first; the seeded settings row does not count as data.
 */
import { sql } from "drizzle-orm"
import type { Db } from "#server/db/client.ts"
import {
  financesAccounts,
  financesBalanceChecks,
  financesCategories,
  financesOccurrences,
  financesSchedules,
  financesTransactions,
  financesTransfers,
  financesWallets,
} from "#server/db/schema/index.ts"
import { newId } from "#shared/ids.ts"
import type { ImportPlan } from "./plan.ts"

/** Finances tables in an order safe to delete from: each before the tables it references. */
const TABLES = [
  ["occurrences", financesOccurrences],
  ["transactions", financesTransactions],
  ["transfers", financesTransfers],
  ["schedules", financesSchedules],
  ["balance checks", financesBalanceChecks],
  ["wallets", financesWallets],
  ["categories", financesCategories],
  ["accounts", financesAccounts],
] as const

/** Rows per insert statement, well under Postgres's parameter limit. */
const CHUNK = 500

export class ImportRefused extends Error {}

export type WrittenCounts = {
  wallets: number
  categories: number
  accounts: number
  actuals: number
  balanceChecks: number
}

function idOf(ids: Map<string, string>, name: string | null): string | null {
  if (name === null) return null
  const id = ids.get(name)
  if (id === undefined) throw new Error(`The plan names an unknown row: ${name}`)
  return id
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

async function tablesWithRows(tx: Tx): Promise<string[]> {
  const found: string[] = []
  for (const [name, table] of TABLES) {
    const rows = await tx
      .select({ one: sql<number>`1` })
      .from(table)
      .limit(1)
    if (rows.length > 0) found.push(name)
  }
  return found
}

async function insertChunked<T>(rows: readonly T[], insert: (chunk: T[]) => Promise<unknown[]>) {
  let written = 0
  for (let start = 0; start < rows.length; start += CHUNK) {
    written += (await insert(rows.slice(start, start + CHUNK))).length
  }
  return written
}

export async function writeImport(
  db: Db,
  plan: ImportPlan,
  options: { wipe: boolean; reviewedAt: Date },
): Promise<WrittenCounts> {
  return db.transaction(async (tx) => {
    const holding = await tablesWithRows(tx)
    if (holding.length > 0 && !options.wipe) {
      throw new ImportRefused(
        `Finances already holds data (${holding.join(", ")}). Run with --wipe to clear it first.`,
      )
    }
    if (options.wipe) {
      for (const [, table] of TABLES) await tx.delete(table)
    }

    const walletId = newId()
    const wallets = await tx
      .insert(financesWallets)
      .values({ id: walletId, name: plan.wallet.name, inForecast: plan.wallet.inForecast })
      .returning({ id: financesWallets.id })

    const categoryIds = new Map(plan.categories.map((name) => [name, newId()]))
    const categories = await tx
      .insert(financesCategories)
      .values([...categoryIds].map(([name, id]) => ({ id, name })))
      .returning({ id: financesCategories.id })

    const accountIds = new Map(plan.accounts.map((name) => [name, newId()]))
    const accounts = await insertChunked([...accountIds], (chunk) =>
      tx
        .insert(financesAccounts)
        .values(chunk.map(([name, id]) => ({ id, name })))
        .returning({ id: financesAccounts.id }),
    )

    const actuals = await insertChunked(plan.actuals, (chunk) =>
      tx
        .insert(financesTransactions)
        .values(
          chunk.map((actual) => ({
            id: newId(),
            status: "actual" as const,
            walletId,
            date: actual.date,
            amountCents: actual.amountCents,
            accountId: idOf(accountIds, actual.account),
            categoryId: idOf(categoryIds, actual.category),
            note: actual.note,
            bankDescription: actual.bankDescription,
            source: "access" as const,
            sourceKey: actual.sourceKey,
            reviewedAt: options.reviewedAt,
          })),
        )
        .returning({ id: financesTransactions.id }),
    )

    const balanceChecks = await insertChunked(plan.balanceChecks, (chunk) =>
      tx
        .insert(financesBalanceChecks)
        .values(chunk.map((check) => ({ id: newId(), walletId, ...check })))
        .returning({ id: financesBalanceChecks.id }),
    )

    const written = {
      wallets: wallets.length,
      categories: categories.length,
      accounts,
      actuals,
      balanceChecks,
    }
    const expected = {
      wallets: 1,
      categories: plan.categories.length,
      accounts: plan.accounts.length,
      actuals: plan.actuals.length,
      balanceChecks: plan.balanceChecks.length,
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

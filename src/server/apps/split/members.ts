import { asc, inArray, or } from "drizzle-orm"
import { Hono } from "hono"
import { holdsAppAccess } from "#server/core/app-access.ts"
import type { AppEnv } from "#server/core/context.ts"
import type { Db } from "#server/db/client.ts"
import { auth_user, splitExpenses, splitPayments, splitShares } from "#server/db/schema/index.ts"
import { accountsOnSide } from "#shared/split/rules.ts"
import type { Member } from "#shared/split/schemas.ts"

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

const OLDEST_FIRST = [asc(auth_user.createdAt), asc(auth_user.id)]

/**
 * Split's Members, derived rather than stored: the Admin plus every Account holding App access to
 * Split. Oldest Account first, the order leftover cents are handed out in.
 */
export async function currentMembers(db: Db | Tx): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: auth_user.id, name: auth_user.name })
    .from(auth_user)
    .where(holdsAppAccess("split"))
    .orderBy(...OLDEST_FIRST)
}

/**
 * Every Account Split's data names: on a share or a Payment, on a side of an Expense by its Split
 * mode (as `accountsOnSide` counts them), or as who added or changed an entry.
 */
async function namedInSplit(db: Db | Tx): Promise<Set<string>> {
  // One after another: within a transaction they share its one connection.
  const shares = await db.selectDistinct({ id: splitShares.accountId }).from(splitShares)
  const payments = await db
    .select({
      fromId: splitPayments.fromId,
      toId: splitPayments.toId,
      addedById: splitPayments.addedById,
      changedById: splitPayments.changedById,
    })
    .from(splitPayments)
  const expenses = await db
    .select({
      paid: splitExpenses.paid,
      owed: splitExpenses.owed,
      addedById: splitExpenses.addedById,
      changedById: splitExpenses.changedById,
    })
    .from(splitExpenses)
  const named = new Set(shares.map((share) => share.id))
  for (const payment of payments) {
    for (const id of [payment.fromId, payment.toId, payment.addedById, payment.changedById]) {
      named.add(id)
    }
  }
  for (const expense of expenses) {
    named.add(expense.addedById).add(expense.changedById)
    for (const id of accountsOnSide(expense.paid, {})) named.add(id)
    for (const id of accountsOnSide(expense.owed, {})) named.add(id)
  }
  return named
}

/**
 * Everyone Split shows, oldest Account first: the Members, and the Former members, the Accounts
 * its data names that have lost App access or become Removed Accounts.
 */
export async function everyoneInSplit(db: Db | Tx): Promise<Member[]> {
  const memberIds = new Set((await currentMembers(db)).map((member) => member.id))
  const named = await namedInSplit(db)
  const rows = await db
    .select({ id: auth_user.id, name: auth_user.name })
    .from(auth_user)
    .where(
      named.size === 0
        ? holdsAppAccess("split")
        : or(holdsAppAccess("split"), inArray(auth_user.id, [...named])),
    )
    .orderBy(...OLDEST_FIRST)
  return rows.map((row) => ({ ...row, former: !memberIds.has(row.id) }))
}

/** The given Accounts' ids, Members or not, oldest Account first. */
export async function oldestFirst(db: Db | Tx, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: auth_user.id })
    .from(auth_user)
    .where(inArray(auth_user.id, [...ids]))
    .orderBy(...OLDEST_FIRST)
  return rows.map((row) => row.id)
}

/**
 * `GET /members`: every Member and Former member by display name, oldest Account first, each
 * Former member marked.
 */
export function memberRoutes(db: Db) {
  return new Hono<AppEnv>().get("/", async (c) => c.json({ rows: await everyoneInSplit(db) }))
}

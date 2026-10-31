import { asc, inArray, isNotNull, sql, type SQL } from "drizzle-orm"
import { Hono } from "hono"
import { holdsAppAccess } from "#server/core/app-access.ts"
import type { AppEnv } from "#server/core/context.ts"
import type { Db } from "#server/db/client.ts"
import { auth_user, splitExpenses, splitPayments, splitShares } from "#server/db/schema/index.ts"
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
 * Whether a stored side of an Expense names the Account by its active Split mode, as
 * `accountsOnSide` counts them: ticked for Equal, above zero for Exact or Percent. Saved percents
 * always parse, so one above zero is one with a digit other than zero.
 */
function sideNames(side: SQL, id: SQL): SQL<boolean> {
  return sql<boolean>`case ${side}->>'mode'
    when 'equal' then (${side}->'ticked') ? ${id}
    when 'exact' then coalesce((${side}->'exact'->>${id})::bigint > 0, false)
    when 'percent' then coalesce((${side}->'percent'->>${id}) ~ '[1-9]', false)
    else false end`
}

/** Whether the Account holds a share or is on a Payment. Indexes cover each lookup. */
const holdsSplitMoney = sql<boolean>`(
  exists (select 1 from ${splitShares} where ${splitShares.accountId} = ${auth_user.id})
  or exists (select 1 from ${splitPayments} where ${splitPayments.fromId} = ${auth_user.id})
  or exists (select 1 from ${splitPayments} where ${splitPayments.toId} = ${auth_user.id})
)`

/**
 * Whether a side of an Expense names the Account by its active Split mode though they hold no
 * share on it, their share having rounded to nothing. Rare, but it still puts them on the Expense,
 * where their age decides leftover cents, so the client must know them. It scans the Expenses, so
 * it runs only for an Account without App access, a share or a Payment.
 */
const namedBySide = sql<boolean>`exists (
  select 1 from ${splitExpenses}
  where ${sideNames(sql`${splitExpenses.paid}`, sql`${auth_user.id}`)}
    or ${sideNames(sql`${splitExpenses.owed}`, sql`${auth_user.id}`)}
)`

/** Whether the Account added or last changed an Expense or Payment. Indexes cover each lookup. */
const authoredInSplit = sql<boolean>`(
  exists (select 1 from ${splitExpenses} where ${splitExpenses.addedById} = ${auth_user.id})
  or exists (select 1 from ${splitExpenses} where ${splitExpenses.changedById} = ${auth_user.id})
  or exists (select 1 from ${splitPayments} where ${splitPayments.addedById} = ${auth_user.id})
  or exists (select 1 from ${splitPayments} where ${splitPayments.changedById} = ${auth_user.id})
)`

/**
 * Every Account Split shows, oldest Account first, by its standing: a Member; a Former member,
 * whom Split's money names but who has lost App access or become a Removed Account; or an author,
 * named only as who added or changed an entry, listed so their name still shows. Each check runs
 * only for Accounts the ones before it leave out.
 */
export async function accountsInSplit(db: Db | Tx): Promise<Member[]> {
  const standing = sql<Member["standing"] | null>`case
    when ${holdsAppAccess("split")} then 'member'
    when ${holdsSplitMoney} then 'former'
    when ${namedBySide} then 'former'
    when ${authoredInSplit} then 'author'
  end`
  // Worked out once per Account, then filtered.
  const accounts = db
    .select({
      id: auth_user.id,
      name: auth_user.name,
      createdAt: auth_user.createdAt,
      standing: standing.as("standing"),
    })
    .from(auth_user)
    .as("accounts")
  const rows = await db
    .select()
    .from(accounts)
    .where(isNotNull(accounts.standing))
    .orderBy(asc(accounts.createdAt), asc(accounts.id))
  return rows.flatMap((row) =>
    row.standing ? [{ id: row.id, name: row.name, standing: row.standing }] : [],
  )
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
 * `GET /members`: every Account Split shows by display name, oldest Account first, each with its
 * standing.
 */
export function memberRoutes(db: Db) {
  return new Hono<AppEnv>().get("/", async (c) => c.json({ rows: await accountsInSplit(db) }))
}

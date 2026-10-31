import { asc, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { holdsAppAccess } from "#server/core/app-access.ts"
import type { AppEnv } from "#server/core/context.ts"
import type { Db } from "#server/db/client.ts"
import { auth_user } from "#server/db/schema/index.ts"
import type { Member } from "#shared/split/schemas.ts"

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

/**
 * Split's Members, derived rather than stored: the Admin plus every Account holding App access to
 * Split. Oldest Account first, the order leftover cents are handed out in.
 */
export async function currentMembers(db: Db | Tx): Promise<Member[]> {
  return db
    .select({ id: auth_user.id, name: auth_user.name })
    .from(auth_user)
    .where(holdsAppAccess("split"))
    .orderBy(asc(auth_user.createdAt), asc(auth_user.id))
}

/** The given Accounts' ids, Members or not, oldest Account first. */
export async function oldestFirst(db: Db | Tx, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({ id: auth_user.id })
    .from(auth_user)
    .where(inArray(auth_user.id, [...ids]))
    .orderBy(asc(auth_user.createdAt), asc(auth_user.id))
  return rows.map((row) => row.id)
}

/** `GET /members`: every Member by name, oldest Account first. */
export function memberRoutes(db: Db) {
  return new Hono<AppEnv>().get("/", async (c) => c.json({ rows: await currentMembers(db) }))
}

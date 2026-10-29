import { and, asc, inArray, ne } from "drizzle-orm"
import { Hono } from "hono"
import { holdsAppAccess } from "#server/core/app-access.ts"
import type { AppEnv } from "#server/core/context.ts"
import type { Db } from "#server/db/client.ts"
import { auth_user } from "#server/db/schema/index.ts"
import type { NotePerson } from "#shared/notes/schemas.ts"

/**
 * The people a Creator may add to an Audience: every Account holding App access to Notes except
 * the Creator themself, by name.
 */
export async function addablePeople(db: Db, callerId: string): Promise<NotePerson[]> {
  return db
    .select({ id: auth_user.id, name: auth_user.name })
    .from(auth_user)
    .where(and(holdsAppAccess("notes"), ne(auth_user.id, callerId)))
    .orderBy(asc(auth_user.name), asc(auth_user.id))
}

/** Of these ids, the Accounts a Creator may add, as a condition on `auth_user` rows. */
export function addableAmong(callerId: string, ids: readonly string[]) {
  return and(holdsAppAccess("notes"), ne(auth_user.id, callerId), inArray(auth_user.id, [...ids]))
}

/** `GET /people`: who the Audience picker offers. */
export function peopleRoutes(db: Db) {
  return new Hono<AppEnv>().get("/", async (c) =>
    c.json({ rows: await addablePeople(db, c.get("account").id) }),
  )
}

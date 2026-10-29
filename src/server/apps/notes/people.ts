import { and, asc, inArray, ne, sql, type SQL } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv } from "#server/core/context.ts"
import type { Db } from "#server/db/client.ts"
import { appAccess, auth_user } from "#server/db/schema/index.ts"
import type { NotePerson } from "#shared/notes/schemas.ts"

/**
 * Accounts that currently hold App access to Notes: the Admin through the role, everyone else
 * through an access row, and never a Removed Account.
 */
function holdsNotesAccess(): SQL {
  return sql`((${auth_user.role} = 'admin' or exists (select 1 from ${appAccess} where ${appAccess.userId} = ${auth_user.id} and ${appAccess.appKey} = 'notes')) and ${auth_user.banned} is not true)`
}

/**
 * The people a Creator may add to an Audience: every Account holding App access to Notes except
 * the Creator themself, by name. With `among`, only those of these ids.
 */
export async function notePeople(
  db: Db,
  callerId: string,
  among?: readonly string[],
): Promise<NotePerson[]> {
  return db
    .select({ id: auth_user.id, name: auth_user.name })
    .from(auth_user)
    .where(
      and(
        holdsNotesAccess(),
        ne(auth_user.id, callerId),
        among === undefined ? undefined : inArray(auth_user.id, [...among]),
      ),
    )
    .orderBy(asc(auth_user.name), asc(auth_user.id))
}

/** `GET /people`: who the Audience picker offers. */
export function peopleRoutes(db: Db) {
  return new Hono<AppEnv>().get("/", async (c) =>
    c.json({ rows: await notePeople(db, c.get("account").id) }),
  )
}

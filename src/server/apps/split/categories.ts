import { asc, sql } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv } from "#server/core/context.ts"
import type { Db } from "#server/db/client.ts"
import { splitCategories } from "#server/db/schema/index.ts"
import type { CategoryRow } from "#shared/split/schemas.ts"

/** `GET /categories`: every Category, archived ones included, by name. */
export function categoryRoutes(db: Db) {
  return new Hono<AppEnv>().get("/", async (c) => {
    const rows: CategoryRow[] = await db
      .select({
        id: splitCategories.id,
        name: splitCategories.name,
        archived: splitCategories.archived,
      })
      .from(splitCategories)
      .orderBy(asc(sql`lower(${splitCategories.name})`), asc(splitCategories.id))
    return c.json({ rows })
  })
}

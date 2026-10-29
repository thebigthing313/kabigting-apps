import { drizzle } from "drizzle-orm/node-postgres"
import { QueryBuilder } from "drizzle-orm/pg-core"
import pg from "pg"
import * as schema from "#server/db/schema/index.ts"

const CASING = "snake_case"

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool, schema, casing: CASING })
  return { db, pool }
}

export type Db = ReturnType<typeof createDb>["db"]

/** Builds subqueries (for `exists`, say) without a connection, named as the database names them. */
export const subquery = new QueryBuilder({ casing: CASING })

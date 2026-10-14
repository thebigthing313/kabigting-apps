import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
import * as schema from "#server/db/schema/index.ts"

export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  const db = drizzle({ client: pool, schema, casing: "snake_case" })
  return { db, pool }
}

export type Db = ReturnType<typeof createDb>["db"]

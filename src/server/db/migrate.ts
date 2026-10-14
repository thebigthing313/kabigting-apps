// Railway pre-deploy command. Applies the committed SQL migrations; never imports drizzle-kit.
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url))

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await pool.end()
  }
}

if (import.meta.main) {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_URL is required")
  await runMigrations(databaseUrl)
  console.log("Migrations applied")
}

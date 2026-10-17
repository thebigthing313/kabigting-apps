import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { z } from "zod"
import { MIGRATIONS_FOLDER, runMigrations } from "#server/db/migrate.ts"
import { createEmptyDatabase, dropDatabase } from "#server/test/databases.ts"

// Unknown journal fields are kept, so the shortened journal stays valid for the migrator.
const journalSchema = z.looseObject({
  entries: z.array(z.looseObject({ tag: z.string() })),
})

let url: string

beforeAll(async () => {
  url = await createEmptyDatabase("migrate_from_empty")
})

afterAll(async () => {
  await dropDatabase("migrate_from_empty")
})

async function query<Row extends pg.QueryResultRow>(
  databaseUrl: string,
  sql: string,
): Promise<Row[]> {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    return (await client.query<Row>(sql)).rows
  } finally {
    await client.end()
  }
}

/** Applies only the migrations before `tag`, from a copy of the folder with a shorter journal. */
async function migrateBefore(databaseUrl: string, tag: string): Promise<void> {
  const folder = await mkdtemp(join(tmpdir(), "kabigting-migrations-"))
  try {
    await cp(MIGRATIONS_FOLDER, folder, { recursive: true })
    const journalPath = join(folder, "meta", "_journal.json")
    const journal = journalSchema.parse(JSON.parse(await readFile(journalPath, "utf8")))
    const index = journal.entries.findIndex((entry) => entry.tag === tag)
    if (index < 0) throw new Error(`No migration ${tag}`)
    journal.entries = journal.entries.slice(0, index)
    await writeFile(journalPath, JSON.stringify(journal))
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 })
    try {
      await migrate(drizzle({ client: pool }), { migrationsFolder: folder })
    } finally {
      await pool.end()
    }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

test("migrations apply to an empty database and create every table", async () => {
  await runMigrations(url)
  const tables = await query<{ table_name: string }>(
    url,
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  )
  expect(tables.map((t) => t.table_name)).toEqual([
    "app_access",
    "auth_account",
    "auth_session",
    "auth_user",
    "auth_verification",
    "finances_accounts",
    "finances_balance_checks",
    "finances_categories",
    "finances_occurrences",
    "finances_schedules",
    "finances_wallets",
    "temporary_password",
  ])
})

test("running migrations again is a no-op", async () => {
  await expect(runMigrations(url)).resolves.toBeUndefined()
})

test("the database makes UUIDv7s natively, for client-id column defaults", async () => {
  const [row] = await query<{ id: string }>(url, "select uuidv7()::text as id")
  expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
})

describe("0002 removes the sample App", () => {
  let earlier: string

  beforeAll(async () => {
    earlier = await createEmptyDatabase("migrate_remove_notes")
  })

  afterAll(async () => {
    await dropDatabase("migrate_remove_notes")
  })

  test("drops skeleton_notes and its app_access rows, keeping other Apps' rows", async () => {
    await migrateBefore(earlier, "0002_drop_skeleton")
    await query(
      earlier,
      `insert into auth_user (id, name, email, updated_at) values ('u1', 'Test', 't@example.com', now());
       insert into app_access (user_id, app_key) values ('u1', 'skeleton'), ('u1', 'finances');
       insert into skeleton_notes (user_id, text, amount_cents, on_date)
         values ('u1', 'x', -1, '2026-10-14')`,
    )

    await runMigrations(earlier)

    const access = await query<{ app_key: string }>(
      earlier,
      "select app_key from app_access order by app_key",
    )
    expect(access.map((row) => row.app_key)).toEqual(["finances"])
    const table = await query(
      earlier,
      "select 1 from information_schema.tables where table_name = 'skeleton_notes'",
    )
    expect(table).toEqual([])
  })
})

describe("0003 drops the Admin's App access rows", () => {
  let earlier: string

  beforeAll(async () => {
    earlier = await createEmptyDatabase("migrate_admin_rows")
  })

  afterAll(async () => {
    await dropDatabase("migrate_admin_rows")
  })

  test("deletes rows belonging to Admins and keeps everyone else's", async () => {
    await migrateBefore(earlier, "0003_admin_holds_every_app")
    await query(
      earlier,
      `insert into auth_user (id, name, email, role, updated_at) values
         ('admin', 'Admin', 'a@example.com', 'admin', now()),
         ('member', 'Member', 'm@example.com', 'user', now());
       insert into app_access (user_id, app_key) values ('admin', 'finances'), ('member', 'finances')`,
    )

    await runMigrations(earlier)

    const access = await query<{ user_id: string }>(
      earlier,
      "select user_id from app_access order by user_id",
    )
    expect(access.map((row) => row.user_id)).toEqual(["member"])
  })
})

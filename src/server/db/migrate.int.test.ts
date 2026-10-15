import pg from "pg"
import { afterAll, beforeAll, expect, test } from "vitest"
import { runMigrations } from "#server/db/migrate.ts"
import { createEmptyDatabase, dropDatabase } from "#server/test/databases.ts"

let url: string

beforeAll(async () => {
  url = await createEmptyDatabase("migrate_from_empty")
})

afterAll(async () => {
  await dropDatabase("migrate_from_empty")
})

async function query<Row extends pg.QueryResultRow>(sql: string): Promise<Row[]> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return (await client.query<Row>(sql)).rows
  } finally {
    await client.end()
  }
}

test("migrations apply to an empty database and create every table", async () => {
  await runMigrations(url)
  const tables = await query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  )
  expect(tables.map((t) => t.table_name)).toEqual([
    "app_access",
    "auth_account",
    "auth_session",
    "auth_user",
    "auth_verification",
    "skeleton_notes",
    "temporary_password",
  ])
})

test("running migrations again is a no-op", async () => {
  await expect(runMigrations(url)).resolves.toBeUndefined()
})

test("skeleton_notes stores signed cents as bigint and dates without a zone", async () => {
  const columns = await query<{ column_name: string; data_type: string }>(
    "select column_name, data_type from information_schema.columns where table_name = 'skeleton_notes' order by ordinal_position",
  )
  expect(Object.fromEntries(columns.map((c) => [c.column_name, c.data_type]))).toEqual({
    id: "uuid",
    user_id: "text",
    text: "text",
    amount_cents: "bigint",
    on_date: "date",
    created_at: "timestamp with time zone",
    updated_at: "timestamp with time zone",
  })
})

test("a note without an id gets a UUIDv7 from the database", async () => {
  const [row] = await query<{ id: string }>(`
    with u as (
      insert into auth_user (id, name, email, updated_at) values ('u1', 'Test', 't@example.com', now())
      returning id
    )
    insert into skeleton_notes (user_id, text, amount_cents, on_date)
    select id, 'x', -1, '2026-10-14' from u returning id`)
  expect(row?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/)
})

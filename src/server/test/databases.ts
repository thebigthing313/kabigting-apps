// Test databases on the local (or CI) Postgres 18. Each Vitest worker gets its own database,
// cloned from a template that global setup migrates once.
import pg from "pg"
import { runMigrations } from "#server/db/migrate.ts"

const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres"
const PREFIX = "kabigting_test_"
const TEMPLATE = `${PREFIX}template`

function urlFor(database: string): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${database}`
  return url.toString()
}

async function admin(sql: string): Promise<void> {
  const client = new pg.Client({ connectionString: ADMIN_URL })
  await client.connect()
  try {
    await client.query(sql)
  } finally {
    await client.end()
  }
}

function quoted(database: string): string {
  if (!/^[a-z0-9_]+$/.test(database)) throw new Error(`Bad test database name: ${database}`)
  return `"${database}"`
}

export async function dropDatabase(name: string): Promise<void> {
  await admin(`drop database if exists ${quoted(PREFIX + name)} with (force)`)
}

export async function createEmptyDatabase(name: string): Promise<string> {
  await dropDatabase(name)
  await admin(`create database ${quoted(PREFIX + name)}`)
  return urlFor(PREFIX + name)
}

/** Builds the migrated template. Every connection to it is closed before workers clone it. */
export async function createTemplate(): Promise<void> {
  await admin(`drop database if exists ${quoted(TEMPLATE)} with (force)`)
  await admin(`create database ${quoted(TEMPLATE)}`)
  await runMigrations(urlFor(TEMPLATE))
}

/** A fresh migrated database for this worker, cloned from the template. */
export async function createWorkerDatabase(): Promise<string> {
  const name = `w${process.env.VITEST_POOL_ID ?? "0"}`
  await dropDatabase(name)
  await admin(`create database ${quoted(PREFIX + name)} template ${quoted(TEMPLATE)}`)
  return urlFor(PREFIX + name)
}

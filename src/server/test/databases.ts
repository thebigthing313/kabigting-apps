// Test databases on the local (or CI) Postgres 18. Each Vitest worker gets its own database,
// cloned from a template that global setup migrates once. Every name carries the run's id
// (`r<pid>` of the Vitest process), so concurrent runs from other worktrees never share one.
import pg from "pg"
import { inject } from "vitest"
import { runMigrations } from "#server/db/migrate.ts"

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseRun: string
  }
}

const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres"
const PREFIX = "kabigting_test_"
const RUN_NAME = /^kabigting_test_r(\d+)_[a-z0-9_]+$/

function urlFor(database: string): string {
  const url = new URL(ADMIN_URL)
  url.pathname = `/${database}`
  return url.toString()
}

async function admin<Row extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  values: unknown[] = [],
): Promise<Row[]> {
  const client = new pg.Client({ connectionString: ADMIN_URL })
  await client.connect()
  try {
    return (await client.query<Row>(sql, values)).rows
  } finally {
    await client.end()
  }
}

function quoted(database: string): string {
  if (!/^[a-z0-9_]+$/.test(database)) throw new Error(`Bad test database name: ${database}`)
  return `"${database}"`
}

/** The prefix of every database in a run; in a worker, the run global setup provided. */
function runPrefix(run: string = inject("testDatabaseRun")): string {
  return `${PREFIX}${run}_`
}

async function dropFullName(database: string): Promise<void> {
  await admin(`drop database if exists ${quoted(database)} with (force)`)
}

async function databasesStartingWith(prefix: string): Promise<string[]> {
  const rows = await admin<{ datname: string }>(
    "select datname from pg_database where starts_with(datname, $1)",
    [prefix],
  )
  return rows.map((row) => row.datname)
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return error instanceof Error && "code" in error && error.code === "EPERM"
  }
}

export async function dropDatabase(name: string): Promise<void> {
  await dropFullName(runPrefix() + name)
}

export async function createEmptyDatabase(name: string): Promise<string> {
  await dropDatabase(name)
  await admin(`create database ${quoted(runPrefix() + name)}`)
  return urlFor(runPrefix() + name)
}

/** An id for a run in this process: unique among the Vitest processes alive on this machine. */
export function newRunId(): string {
  return `r${process.pid}`
}

/** Drops databases left by runs whose Vitest process is gone, after a crash or a kill. */
export async function dropOrphanedDatabases(): Promise<void> {
  for (const database of await databasesStartingWith(PREFIX)) {
    const pid = RUN_NAME.exec(database)?.[1]
    if (pid !== undefined && !isAlive(Number(pid))) await dropFullName(database)
  }
}

/** Builds the run's migrated template. Every connection to it is closed before workers clone it. */
export async function createTemplate(run: string): Promise<void> {
  const template = `${runPrefix(run)}template`
  await dropFullName(template)
  await admin(`create database ${quoted(template)}`)
  await runMigrations(urlFor(template))
}

/** Drops every database the run created: its template and each worker's. */
export async function dropRunDatabases(run: string): Promise<void> {
  for (const database of await databasesStartingWith(runPrefix(run))) await dropFullName(database)
}

/** A fresh migrated database for this worker, cloned from the run's template. */
export async function createWorkerDatabase(): Promise<string> {
  const database = `${runPrefix()}w${process.env.VITEST_POOL_ID ?? "0"}`
  await dropFullName(database)
  await admin(`create database ${quoted(database)} template ${quoted(`${runPrefix()}template`)}`)
  return urlFor(database)
}

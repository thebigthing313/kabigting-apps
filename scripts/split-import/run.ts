// The one-time import of the household's Splitwise history, from the snapshot `pnpm split:fetch`
// writes and the git-ignored mapping of Splitwise user to Account email:
//   pnpm split:import [--dry-run] [--wipe] <snapshot file>
// It never touches the network. It reads the Accounts the mapping names, even on a dry run, then
// writes to DATABASE_URL in one transaction. It refuses when Split holds data unless --wipe is
// given, and prints only counts and numbered Members. Any mismatch exits non-zero and writes
// nothing.
import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { asc, inArray, sql } from "drizzle-orm"
import { holdsAppAccess } from "#server/core/app-access.ts"
import { createDb, type Db } from "#server/db/client.ts"
import { auth_user } from "#server/db/schema/index.ts"
import { MAP_FILE, parseMapping, type MappingEntry } from "./mapping.ts"
import { planImport, type ImportAccount } from "./plan.ts"
import { formatReport } from "./report.ts"
import { writeImport } from "./write.ts"

const USAGE = "Usage: pnpm split:import [--dry-run] [--wipe] <snapshot file>"

export class ImportFailed extends Error {}

const BYTE_ORDER_MARK = 0xfeff

/** A JSON file, named in messages by `label` rather than its contents. */
async function readJson(path: string, label: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    throw new ImportFailed(`Could not read the ${label}`)
  }
  if (text.charCodeAt(0) === BYTE_ORDER_MARK) text = text.slice(1)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ImportFailed(`The ${label} is not valid JSON`)
  }
}

/** The Accounts the mapping names, oldest first, with whether each holds App access to Split. */
async function mappedAccounts(db: Db, mapping: readonly MappingEntry[]): Promise<ImportAccount[]> {
  return db
    .select({
      id: auth_user.id,
      email: auth_user.email,
      access: sql<boolean>`${holdsAppAccess("split")}`,
    })
    .from(auth_user)
    .where(
      inArray(
        sql`lower(${auth_user.email})`,
        mapping.map((entry) => entry.email),
      ),
    )
    .orderBy(asc(auth_user.createdAt), asc(auth_user.id))
}

export type ImportDeps = {
  /** Opens the database: a dry run reads the mapped Accounts too. */
  connect: () => { db: Db; close: () => Promise<void> }
  /** The mapping file; the git-ignored one in scripts/ by default. */
  mapFile?: string
  now?: Date
}

export async function runImport(
  args: readonly string[],
  deps: ImportDeps,
  print: (line: string) => void,
): Promise<void> {
  const { values, positionals } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: { "dry-run": { type: "boolean" }, wipe: { type: "boolean" } },
  })
  const [file, ...extra] = positionals
  if (file === undefined || extra.length > 0) throw new ImportFailed(USAGE)
  const dryRun = values["dry-run"] === true

  const snapshot = await readJson(file, "snapshot")
  const mapFile = deps.mapFile ?? MAP_FILE
  const mapping = parseMapping(await readJson(mapFile, `mapping file ${mapFile}`))

  const { db, close } = deps.connect()
  try {
    const plan = planImport(snapshot, mapping, await mappedAccounts(db, mapping))
    print(dryRun ? "Split import: dry run, nothing is written" : "Split import")
    for (const line of formatReport(plan)) print(line)
    if (plan.report.failures.length > 0) {
      throw new ImportFailed("The import found mismatches and wrote nothing.")
    }
    if (dryRun) return

    const written = await writeImport(db, plan, {
      wipe: values.wipe === true,
      now: deps.now ?? new Date(),
    })
    print(
      `Wrote ${written.expenses} Expenses with ${written.shares} shares, and ${written.payments} Payments.`,
    )
  } finally {
    await close()
  }
}

if (import.meta.main) {
  try {
    await runImport(
      process.argv.slice(2),
      {
        connect: () => {
          const url = process.env.DATABASE_URL
          if (!url) throw new ImportFailed("DATABASE_URL is not set")
          const { db, pool } = createDb(url)
          return { db, close: () => pool.end() }
        },
      },
      (line) => console.log(line),
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

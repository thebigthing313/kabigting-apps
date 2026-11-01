// The one-time import of the household's Splitwise history, from the snapshot `pnpm split:fetch`
// writes and the git-ignored mapping of Splitwise user to Account email:
//   pnpm split:import [--dry-run] [--wipe] <snapshot file>
// It never touches the network. It reads the Accounts the mapping names, even on a dry run, then
// writes to DATABASE_URL in one transaction. It refuses when Split holds data unless --wipe is
// given, and prints only counts and numbered Members. Any mismatch exits non-zero and writes
// nothing.
//
// Only the script's own errors are printed as they are: they never hold a value. Anything else, a
// database error above all (Drizzle puts the query and its parameters in the message), is printed
// as fixed text with at most its error code.
import { readFile } from "node:fs/promises"
import { parseArgs } from "node:util"
import { asc, DrizzleQueryError, inArray, sql } from "drizzle-orm"
import { holdsAppAccess } from "#server/core/app-access.ts"
import { createDb, type Db } from "#server/db/client.ts"
import { auth_user } from "#server/db/schema/index.ts"
import { MAP_FILE, MappingInvalid, parseMappingText, type MappingEntry } from "./mapping.ts"
import { planImport, type ImportAccount } from "./plan.ts"
import { formatReport } from "./report.ts"
import { SnapshotInvalid } from "./snapshot.ts"
import { ImportRefused, splitHolds, writeImport } from "./write.ts"

const USAGE = "Usage: pnpm split:import [--dry-run] [--wipe] <snapshot file>"

export class ImportFailed extends Error {}

const BYTE_ORDER_MARK = 0xfeff

/** A text file, named in messages by `label` rather than its contents. */
async function readText(path: string, label: string): Promise<string> {
  let text: string
  try {
    text = await readFile(path, "utf8")
  } catch {
    throw new ImportFailed(`Could not read the ${label}`)
  }
  return text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text
}

async function readJson(path: string, label: string): Promise<unknown> {
  const text = await readText(path, label)
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

/** A Postgres or Node error code ("23514", "ECONNREFUSED"), never anything else from the error. */
function codeOf(error: unknown): string | null {
  for (let at: unknown = error, depth = 0; depth < 3; depth++) {
    if (typeof at !== "object" || at === null) return null
    const code = "code" in at ? at.code : undefined
    if (typeof code === "string" && /^[A-Z0-9_]{2,30}$/.test(code)) return code
    at = "cause" in at ? at.cause : undefined
  }
  return null
}

/** The error as it may be printed: the script's own as they are, anything else as fixed text. */
export function printable(error: unknown): Error {
  if (
    error instanceof ImportFailed ||
    error instanceof ImportRefused ||
    error instanceof MappingInvalid ||
    error instanceof SnapshotInvalid
  ) {
    return error
  }
  const code = codeOf(error)
  const what =
    error instanceof DrizzleQueryError || code !== null
      ? "The import failed with a database error"
      : "The import failed unexpectedly"
  return new ImportFailed(`${what}; nothing was written${code ? ` (code ${code})` : ""}.`)
}

export type ImportDeps = {
  /** Opens the database: a dry run reads the mapped Accounts too. */
  connect: () => { db: Db; close: () => Promise<void> }
  /** The mapping file; the git-ignored one in scripts/ by default. */
  mapFile?: string
}

function parsed(args: readonly string[]) {
  try {
    return parseArgs({
      args: [...args],
      allowPositionals: true,
      options: { "dry-run": { type: "boolean" }, wipe: { type: "boolean" } },
    })
  } catch {
    throw new ImportFailed(USAGE)
  }
}

async function run(
  args: readonly string[],
  deps: ImportDeps,
  print: (line: string) => void,
): Promise<void> {
  const { values, positionals } = parsed(args)
  const [file, ...extra] = positionals
  if (file === undefined || extra.length > 0) throw new ImportFailed(USAGE)
  const dryRun = values["dry-run"] === true
  const wipe = values.wipe === true

  const snapshot = await readJson(file, "snapshot")
  const mapFile = deps.mapFile ?? MAP_FILE
  const mapping = parseMappingText(await readText(mapFile, `mapping file ${mapFile}`))

  const { db, close } = deps.connect()
  try {
    const plan = planImport(snapshot, mapping, await mappedAccounts(db, mapping))
    print(dryRun ? "Split import: dry run, nothing is written" : "Split import")
    for (const line of formatReport(plan)) print(line)
    if (plan.report.failures.length > 0) {
      throw new ImportFailed("The import found mismatches and wrote nothing.")
    }
    if (dryRun) {
      const holding = await splitHolds(db)
      if (holding.length > 0) {
        print(
          wipe
            ? `A real run with --wipe would first delete what Split holds (${holding.join(", ")}).`
            : `A real run would be refused: Split already holds data (${holding.join(", ")}); pass --wipe.`,
        )
      }
      return
    }

    const written = await writeImport(db, plan, { wipe })
    print(
      `Wrote ${written.expenses} Expenses with ${written.shares} shares, and ${written.payments} Payments.`,
    )
  } finally {
    await close()
  }
}

export async function runImport(
  args: readonly string[],
  deps: ImportDeps,
  print: (line: string) => void,
): Promise<void> {
  try {
    await run(args, deps, print)
  } catch (error) {
    throw printable(error)
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
    console.error(printable(error).message)
    process.exitCode = 1
  }
}

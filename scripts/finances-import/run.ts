// The one-time import of the old household data (spec §8), from the normalised extract that
// `scripts/finances-extract.ps1` writes:
//   pnpm finances:import [--dry-run] [--wipe] <extract dir>
// It writes to DATABASE_URL in one transaction, refuses when Finances holds data unless --wipe
// is given, and prints only counts. Any mismatch exits non-zero and writes nothing.
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { createDb, type Db } from "#server/db/client.ts"
import { today } from "#shared/dates.ts"
import { EXTRACT_FILES, parseExtract, type ExtractFile } from "./extract.ts"
import { planImport } from "./plan.ts"
import { formatReport } from "./report.ts"
import { writeImport } from "./write.ts"

const USAGE = "Usage: pnpm finances:import [--dry-run] [--wipe] <extract dir>"

export class ImportFailed extends Error {}

const BYTE_ORDER_MARK = 0xfeff

async function readExtractFile(dir: string, file: ExtractFile): Promise<unknown> {
  let text: string
  try {
    text = await readFile(join(dir, `${file}.json`), "utf8")
  } catch {
    throw new ImportFailed(`Missing ${file}.json in the extract directory`)
  }
  // PowerShell may write a byte-order mark.
  if (text.charCodeAt(0) === BYTE_ORDER_MARK) text = text.slice(1)
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new ImportFailed(`${file}.json is not valid JSON`)
  }
}

export async function readExtractDir(dir: string): Promise<Record<ExtractFile, unknown>> {
  const raw: Record<ExtractFile, unknown> = {
    categories: null,
    schedules: null,
    transactions: null,
    ledger: null,
    balances: null,
  }
  for (const file of EXTRACT_FILES) raw[file] = await readExtractFile(dir, file)
  return raw
}

export type ImportDeps = {
  /** Opens the database; called only for a real run. */
  connect: () => { db: Db; close: () => Promise<void> }
  today?: string
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
  const [dir, ...extra] = positionals
  if (dir === undefined || extra.length > 0) throw new ImportFailed(USAGE)
  const dryRun = values["dry-run"] === true

  const extract = parseExtract(await readExtractDir(dir))
  const plan = planImport(extract, { today: deps.today ?? today() })
  print(dryRun ? "Finances import: dry run, nothing is written" : "Finances import")
  for (const line of formatReport(plan)) print(line)
  if (plan.report.failures.length > 0) {
    throw new ImportFailed("The import found mismatches and wrote nothing.")
  }
  if (dryRun) return

  const { db, close } = deps.connect()
  try {
    const written = await writeImport(db, plan, {
      wipe: values.wipe === true,
      reviewedAt: deps.now ?? new Date(),
    })
    print(
      `Wrote ${written.wallets} Wallet, ${written.categories} Categories, ${written.accounts} Accounts, ${written.actuals} Actuals and ${written.balanceChecks} Balance checks.`,
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

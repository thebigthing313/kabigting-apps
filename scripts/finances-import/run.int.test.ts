// `pnpm finances:import` end to end on a made-up extract and this worker's own database.
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { asc, eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { createDb } from "#server/db/client.ts"
import {
  financesAccounts,
  financesBalanceChecks,
  financesCategories,
  financesTransactions,
  financesWallets,
} from "#server/db/schema/index.ts"
import { createWorkerDatabase } from "#server/test/databases.ts"
import { runImport } from "./run.ts"

const TODAY = "2026-10-18"
const NOW = new Date(Date.UTC(2026, 9, 18, 12))

const PAYEE = "Imaginary Noodle Bar"
const NOTE = "made-up note"
const BANK = "POS 0000 IMAGINARY NOODLE"

/** A small made-up extract in the normalised format the extract script writes. */
function extract(changes: Record<string, unknown[]> = {}) {
  return {
    categories: [
      { id: 1, name: "Groceries" },
      { id: 2, name: "Paycheck" },
      { id: 3, name: "Credit Cards" },
    ],
    schedules: [
      { id: 1, kind: "income", name: "Example Employer", categoryId: 2 },
      { id: 1, kind: "expense", name: "Example Card", categoryId: 3 },
    ],
    transactions: [
      {
        id: 1,
        kind: "income",
        scheduleId: 1,
        date: "2025-01-15",
        amount: "2000.00",
        note: null,
        pending: false,
        posted: true,
      },
      {
        id: 1,
        kind: "expense",
        scheduleId: 1,
        date: "2025-01-20",
        amount: "150.25",
        note: null,
        pending: true,
        posted: false,
      },
      {
        id: 2,
        kind: "expense",
        scheduleId: 1,
        date: "2030-01-20",
        amount: "150.25",
        note: null,
        pending: false,
        posted: false,
      },
    ],
    ledger: [
      {
        id: 10,
        isExpense: true,
        transactionId: null,
        date: "2025-01-03",
        payee: PAYEE,
        amount: "42.10",
        categoryId: 1,
        note: NOTE,
        bankDescription: BANK,
        bankDate: "2025-01-04",
      },
      {
        id: 11,
        isExpense: true,
        transactionId: 1,
        date: "2025-01-20",
        payee: null,
        amount: "150.25",
        categoryId: 3,
        note: null,
        bankDescription: null,
        bankDate: null,
      },
    ],
    balances: [
      { id: 1, enteredAt: "2025-01-31T08:00:00", amount: "900.00" },
      { id: 2, enteredAt: "2025-01-31T20:00:00", amount: "1000.00" },
    ],
    ...changes,
  }
}

let db: ReturnType<typeof createDb>["db"]
let pool: ReturnType<typeof createDb>["pool"]
let dir: string

beforeAll(async () => {
  ;({ db, pool } = createDb(await createWorkerDatabase()))
  dir = await mkdtemp(join(tmpdir(), "finances-extract-"))
})

afterAll(async () => {
  await pool.end()
  await rm(dir, { recursive: true, force: true })
})

beforeEach(async () => {
  await writeExtract(extract())
})

async function writeExtract(files: Record<string, unknown[]>) {
  for (const [name, rows] of Object.entries(files)) {
    await writeFile(join(dir, `${name}.json`), JSON.stringify(rows))
  }
}

async function run(...args: string[]) {
  const lines: string[] = []
  await runImport(
    [...args, dir],
    { connect: () => ({ db, close: async () => {} }), today: TODAY, now: NOW },
    (line) => lines.push(line),
  )
  return lines.join("\n")
}

async function wipe() {
  await run("--wipe")
}

describe("finances:import", () => {
  test("a dry run prints only counts and writes nothing", async () => {
    await db.delete(financesTransactions)
    await db.delete(financesBalanceChecks)
    await db.delete(financesWallets)
    const output = await run("--dry-run")
    expect(output).toContain("dry run")
    expect(output).toContain("3 Actuals, 1 Balance checks")
    expect(output).toContain("No mismatches.")
    for (const secret of [PAYEE, NOTE, BANK, "Example Employer", "Example Card"]) {
      expect(output).not.toContain(secret)
    }
    expect(await db.select().from(financesWallets)).toEqual([])
  })

  test("the real run writes Checking, the 18 Categories, reviewed Actuals and Balance checks", async () => {
    await wipe()
    const [wallet, ...otherWallets] = await db.select().from(financesWallets)
    expect(otherWallets).toEqual([])
    expect(wallet).toMatchObject({ name: "Checking", inForecast: true, shownAsOwed: false })

    expect(await db.$count(financesCategories)).toBe(18)
    const actuals = await db
      .select()
      .from(financesTransactions)
      .orderBy(asc(financesTransactions.sourceKey))
    expect(
      actuals.map((a) => [a.sourceKey, a.date, a.amountCents, a.source, a.status, a.walletId]),
    ).toEqual([
      ["income:1", "2025-01-15", 200000, "access", "actual", wallet?.id],
      ["ledger:10", "2025-01-04", -4210, "access", "actual", wallet?.id],
      ["ledger:11", "2025-01-20", -15025, "access", "actual", wallet?.id],
    ])
    // History never lands in To review.
    expect(actuals.every((a) => a.reviewedAt?.getTime() === NOW.getTime())).toBe(true)

    const cardPayment = actuals.find((a) => a.sourceKey === "ledger:11")
    const [category] = await db
      .select()
      .from(financesCategories)
      .where(eq(financesCategories.id, cardPayment?.categoryId ?? ""))
    expect(category?.name).toBe("Card payments")
    const accounts = await db.select().from(financesAccounts).orderBy(asc(financesAccounts.name))
    expect(accounts.map((a) => a.name)).toEqual(["Example Card", "Example Employer"])
    expect(actuals.find((a) => a.sourceKey === "ledger:10")).toMatchObject({
      accountId: null,
      note: `${PAYEE} · ${NOTE}`,
      bankDescription: BANK,
    })

    expect(
      (await db.select().from(financesBalanceChecks)).map((c) => [c.date, c.amountCents]),
    ).toEqual([["2025-01-31", 100000]])
  })

  test("refuses when Finances holds data, and --wipe replaces it", async () => {
    await wipe()
    await expect(run()).rejects.toThrow(/already holds data.*--wipe/)
    await wipe()
    expect(await db.$count(financesTransactions)).toBe(3)
    expect(await db.$count(financesWallets)).toBe(1)
  })

  test("an unmapped old category fails the run and writes nothing", async () => {
    await db.delete(financesTransactions)
    await db.delete(financesBalanceChecks)
    await db.delete(financesWallets)
    await writeExtract(
      extract({
        categories: [
          { id: 1, name: "Imaginary Hobby" },
          { id: 2, name: "Paycheck" },
          { id: 3, name: "Credit Cards" },
        ],
      }),
    )
    let output = ""
    await expect(
      runImport(
        [dir],
        { connect: () => ({ db, close: async () => {} }), today: TODAY, now: NOW },
        (line) => (output += `${line}\n`),
      ),
    ).rejects.toThrow("wrote nothing")
    expect(output).toContain("Old category not in the mapping: Imaginary Hobby")
    expect(await db.$count(financesWallets)).toBe(0)
  })
})

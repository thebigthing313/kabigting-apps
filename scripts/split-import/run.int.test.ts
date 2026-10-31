// `pnpm split:import` end to end on a made-up snapshot and mapping and this worker's own database.
// Every id, name, email, description and amount here is invented.
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { householdBalances } from "#shared/split/rules.ts"
import {
  expenseRows,
  members as membersSchema,
  paymentRows,
  type ExpenseRow,
} from "#shared/split/schemas.ts"
import {
  splitCategories,
  splitExpenses,
  splitPayments,
  splitShares,
} from "#server/db/schema/index.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import { runImport } from "./run.ts"

const NOW = new Date(Date.UTC(2026, 9, 31, 12))
const DESCRIPTION = "Imaginary noodle night"
const DETAILS = "made-up details"

// Made-up Splitwise user ids.
const ADA = 801
const BO = 802
const CY = 803

type Signed = { headers: Headers; id: string; email: string }

let server: TestServer
let admin: Signed
let ada: Signed
let bo: Signed
/** Mapped, but without App access: a Former member once imported. */
let cy: Signed
let dir: string
let snapshotFile: string
let mapFile: string

async function account(options: Parameters<TestServer["signedInAccount"]>[0]): Promise<Signed> {
  const { headers, user: saved } = await server.signedInAccount(options)
  return { headers, id: saved.id, email: saved.email }
}

function user(id: number, paid: string, owed: string) {
  return { user_id: id, user: { id, first_name: "Made" }, paid_share: paid, owed_share: owed }
}

function row(id: number, changes: Record<string, unknown>) {
  return {
    id,
    group_id: 4242,
    description: DESCRIPTION,
    details: null,
    payment: false,
    cost: "30.0",
    currency_code: "USD",
    date: "2025-03-15T02:30:00Z",
    created_at: "2025-03-15T02:35:00Z",
    deleted_at: null,
    category: { id: 13, name: "Dining out" },
    users: [],
    ...changes,
  }
}

/**
 * Ada paid $30.00 for dinner Bo and Cy owe $10.00 and $20.00 of; Bo paid Ada $10.00 back; Bo
 * paid $9.00 for supplies he and Ada share; and one deleted row. Ada is owed $15.50, Bo $4.50
 * and Cy owes $20.00, which is what the group reports unless `balances` says otherwise.
 */
function snapshot(
  balances: Record<number, string> = { [ADA]: "15.5", [BO]: "4.5", [CY]: "-20.0" },
) {
  const rows = [
    row(9001, {
      details: DETAILS,
      users: [user(ADA, "30.0", "0.0"), user(BO, "0.0", "10.0"), user(CY, "0.0", "20.0")],
    }),
    row(9002, {
      payment: true,
      description: "Bo paid Ada",
      cost: "10.0",
      date: "2025-03-20T15:00:00Z",
      category: { id: 18, name: "General" },
      users: [user(BO, "10.0", "0.0"), user(ADA, "0.0", "10.0")],
    }),
    row(9003, {
      cost: "9.0",
      date: "2025-02-01T15:00:00Z",
      category: { id: 1, name: "Cleaning" },
      users: [user(BO, "9.0", "4.5"), user(ADA, "0.0", "4.5")],
    }),
    row(9004, { deleted_at: "2025-02-02T00:00:00Z", cost: "1.0" }),
  ]
  return {
    groupId: "4242",
    fetchedAt: "2026-10-31T00:00:00.000Z",
    group: {
      group: {
        id: 4242,
        members: Object.entries(balances).map(([id, amount]) => ({
          id: Number(id),
          first_name: "Made",
          balance: amount === "0.0" ? [] : [{ currency_code: "USD", amount }],
        })),
      },
    },
    expensePages: [{ expenses: rows.slice(0, 2) }, { expenses: rows.slice(2) }],
  }
}

async function writeSnapshot(file: unknown = snapshot()) {
  await writeFile(snapshotFile, JSON.stringify(file))
}

beforeAll(async () => {
  server = await createTestServer()
  admin = await account({ role: "admin" })
  ada = await account({ apps: ["split"] })
  bo = await account({ apps: ["split"] })
  cy = await account({})
  dir = await mkdtemp(join(tmpdir(), "split-import-"))
  snapshotFile = join(dir, "splitwise-snapshot.json")
  mapFile = join(dir, "split-import.map.json")
  await writeFile(
    mapFile,
    JSON.stringify({ [ADA]: ada.email, [BO]: bo.email.toUpperCase(), [CY]: cy.email }),
  )
})

afterAll(async () => {
  await server.close()
  await rm(dir, { recursive: true, force: true })
})

beforeEach(async () => {
  await writeSnapshot()
})

async function run(...args: string[]) {
  const lines: string[] = []
  try {
    await runImport(
      [...args, snapshotFile],
      { connect: () => ({ db: server.db, close: async () => {} }), mapFile, now: NOW },
      (line) => lines.push(line),
    )
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      output: lines.join("\n"),
    })
  }
  return lines.join("\n")
}

/** The output of a run that fails, and its error. */
async function failedRun(...args: string[]) {
  try {
    await run(...args)
  } catch (error) {
    const output = error instanceof Error && "output" in error ? String(error.output) : ""
    return { message: error instanceof Error ? error.message : String(error), output }
  }
  throw new Error("The run did not fail")
}

async function clearSplit() {
  await server.db.delete(splitExpenses)
  await server.db.delete(splitPayments)
}

async function get(path: string, as: Signed = ada) {
  const response = await server.app.request(`/api/split/${path}`, { headers: as.headers })
  expect(response.status).toBe(200)
  return response.json()
}

async function stored() {
  return {
    expenses: await server.db.$count(splitExpenses),
    payments: await server.db.$count(splitPayments),
  }
}

describe("split:import", () => {
  test("a dry run prints the report, echoes nothing private and writes nothing", async () => {
    await clearSplit()
    const output = await run("--dry-run")
    expect(output).toContain("dry run")
    expect(output).toContain("Rows read: 4, deleted rows skipped: 1")
    expect(output).toContain("To write: 2 Expenses and 1 Payments")
    expect(output).toMatch(/2025 Dining out\s+1\s+\$30\.00/)
    expect(output).toMatch(/2025 Household supplies\s+1\s+\$9\.00/)
    // Members by number: Ada, Bo, then Cy, who holds no App access.
    expect(output).toMatch(/1 yes\s+\$15\.50\s+\$15\.50\s+\$0\.00/)
    expect(output).toMatch(/3 no\s+-\$20\.00\s+-\$20\.00\s+\$0\.00/)
    expect(output).toContain("No mismatches.")
    for (const secret of [DESCRIPTION, DETAILS, "@example.com", String(ADA), ada.id, "Made"]) {
      expect(output).not.toContain(secret)
    }
    expect(await stored()).toEqual({ expenses: 0, payments: 0 })
  })

  test("writes ordinary Expenses in exact dollars and Payments, marked imported", async () => {
    await clearSplit()
    const output = await run()
    expect(output).toContain("Wrote 2 Expenses with 6 shares, and 1 Payments.")

    const expenses = expenseRows.parse(await get("expenses")).rows
    const dinner = expenses.find((expense) => expense.total === 3_000)
    const categories = await server.db.select().from(splitCategories)
    expect(dinner).toMatchObject({
      description: DESCRIPTION,
      // 02:30 UTC on Mar 15 is the evening of Mar 14 in New York.
      date: "2025-03-14",
      categoryId: categories.find((category) => category.name === "Dining out")?.id,
      note: DETAILS,
      paid: { mode: "exact", exact: { [ada.id]: 3_000 } },
      owed: { mode: "exact", exact: { [bo.id]: 1_000, [cy.id]: 2_000 } },
      paidShares: { [ada.id]: 3_000 },
      owedShares: { [bo.id]: 1_000, [cy.id]: 2_000 },
      addedBy: admin.id,
      addedAt: NOW.toISOString(),
      changedBy: admin.id,
      changedAt: NOW.toISOString(),
      imported: true,
    })
    const payments = paymentRows.parse(await get("payments")).rows
    expect(payments).toEqual([
      expect.objectContaining({
        date: "2025-03-20",
        fromId: bo.id,
        toId: ada.id,
        amount: 1_000,
        note: "",
        addedBy: admin.id,
        imported: true,
      }),
    ])

    // Balances carry over, and Cy, mapped without access, is a Former member, not granted it.
    const balances = householdBalances(expenses, payments, [ada.id, bo.id, cy.id])
    expect(balances).toEqual({ [ada.id]: 1_550, [bo.id]: 450, [cy.id]: -2_000 })
    const listed = membersSchema.parse(await get("members")).rows
    expect(listed.find((member) => member.id === cy.id)?.standing).toBe("former")
    const asCy = await server.app.request("/api/split/expenses", { headers: cy.headers })
    expect(asCy.status).toBe(403)

    // It opens in the normal form: saving it as it stands is accepted, and stays imported.
    const response = await server.app.request(
      `/api/split/expenses/${dinner?.id}`,
      json("PUT", editable(dinner), bo.headers),
    )
    expect(response.status).toBe(200)
    const [changed] = await server.db
      .select()
      .from(splitExpenses)
      .where(eq(splitExpenses.id, dinner?.id ?? ""))
    expect(changed).toMatchObject({ imported: true, addedById: admin.id, changedById: bo.id })
  })

  test("refuses when Split holds data, and --wipe replaces it with the import", async () => {
    await clearSplit()
    await run()
    const failed = await failedRun()
    expect(failed.message).toMatch(/already holds data.*--wipe/)
    expect(await stored()).toEqual({ expenses: 2, payments: 1 })

    // Hand-entered data and a new Category go too; the seeded twelve stay.
    const created = await server.app.request(
      "/api/split/categories",
      json("POST", { id: newId(), name: "Made-up hobby" }, ada.headers),
    )
    expect(created.status).toBe(201)
    await run("--wipe")
    expect(await stored()).toEqual({ expenses: 2, payments: 1 })
    expect(await server.db.$count(splitCategories)).toBe(12)
    expect(await server.db.$count(splitShares)).toBe(6)
  })

  test("a Category added since counts as data too", async () => {
    await clearSplit()
    const created = await server.app.request(
      "/api/split/categories",
      json("POST", { id: newId(), name: "Another made-up hobby" }, ada.headers),
    )
    expect(created.status).toBe(201)
    expect((await failedRun()).message).toMatch(/Categories beyond the seeded twelve/)
    expect(await stored()).toEqual({ expenses: 0, payments: 0 })
    await run("--wipe")
  })

  test("the Balance check blocks the write on a one-cent difference, wipe or not", async () => {
    await clearSplit()
    await run()
    await writeSnapshot(snapshot({ [ADA]: "15.51", [BO]: "4.49", [CY]: "-20.0" }))
    const failed = await failedRun("--wipe")
    expect(failed.message).toContain("wrote nothing")
    expect(failed.output).toContain("Member 1: the computed Balance differs from Splitwise's")
    expect(failed.output).toMatch(/1 yes\s+\$15\.50\s+\$15\.51\s+-\$0\.01\s+DIFFERS/)
    // The earlier import is untouched: the wipe never ran.
    const expenses = expenseRows.parse(await get("expenses")).rows
    expect(expenses).toHaveLength(2)
  })

  test("a failure while writing rolls the wipe back too: all or nothing", async () => {
    await clearSplit()
    await run()
    const before = expenseRows.parse(await get("expenses")).rows.map((expense) => expense.id)
    // A Member renamed a seeded Category the import maps onto.
    await server.db
      .update(splitCategories)
      .set({ name: "Made-up cleaning" })
      .where(eq(splitCategories.name, "Household supplies"))
    try {
      expect((await failedRun("--wipe")).message).toMatch(/missing from Split/)
      const after = expenseRows.parse(await get("expenses")).rows.map((expense) => expense.id)
      expect(after.toSorted()).toEqual(before.toSorted())
    } finally {
      await server.db
        .update(splitCategories)
        .set({ name: "Household supplies" })
        .where(eq(splitCategories.name, "Made-up cleaning"))
    }
  })

  test("an unknown email fails before anything is written", async () => {
    await clearSplit()
    await writeFile(
      mapFile,
      JSON.stringify({ [ADA]: ada.email, [BO]: "nobody@example.com", [CY]: cy.email }),
    )
    try {
      const failed = await failedRun()
      expect(failed.output).toContain("Mapping entry 2: no Account has that email")
      expect(failed.output).not.toContain("nobody@example.com")
      expect(await stored()).toEqual({ expenses: 0, payments: 0 })
    } finally {
      await writeFile(mapFile, JSON.stringify({ [ADA]: ada.email, [BO]: bo.email, [CY]: cy.email }))
    }
  })
})

/** An Expense as the edit form sends it back unchanged. */
function editable(expense: ExpenseRow | undefined) {
  if (!expense) throw new Error("No such Expense")
  const { description, date, categoryId, total, note, paid, owed } = expense
  return { description, date, categoryId, total, note, paid, owed }
}

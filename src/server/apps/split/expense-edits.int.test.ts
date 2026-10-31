// Changing and deleting Expenses: any Member, the whole record at once, who and when, and an
// Expense that is gone staying gone.
import { eq, inArray } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { splitCategories, splitShares } from "#server/db/schema/index.ts"
import { newId } from "#shared/ids.ts"
import { equalSide } from "#shared/split/rules.ts"
import {
  categoryRows,
  expenseRow,
  expenseRows,
  type CategoryRow,
  type ExpenseRow,
} from "#shared/split/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

type Signed = { headers: Headers; id: string }

let server: TestServer
let admin: Signed
let ana: Signed
let ben: Signed
let noAccess: Headers
let general: CategoryRow
let groceries: CategoryRow

async function account(options: Parameters<TestServer["signedInAccount"]>[0]): Promise<Signed> {
  const { headers, user } = await server.signedInAccount(options)
  return { headers, id: user.id }
}

beforeAll(async () => {
  server = await createTestServer()
  admin = await account({ role: "admin" })
  ana = await account({ apps: ["split"] })
  ben = await account({ apps: ["split"] })
  noAccess = (await account({ apps: ["notes"] })).headers
  const response = await server.app.request("/api/split/categories", { headers: ana.headers })
  const rows = categoryRows.parse(await response.json()).rows
  const named = (name: string) => {
    const found = rows.find((category) => category.name === name)
    if (!found) throw new Error(`${name} is not seeded`)
    return found
  }
  general = named("General")
  groceries = named("Groceries")
})

afterAll(async () => {
  await server.close()
})

function fields(overrides: Record<string, unknown> = {}) {
  return {
    description: "Groceries run",
    date: "2026-10-31",
    categoryId: general.id,
    total: 9_000,
    note: "",
    paid: equalSide([ana.id]),
    owed: equalSide([admin.id, ana.id, ben.id]),
    ...overrides,
  }
}

async function created(overrides: Record<string, unknown> = {}, as = ana) {
  const response = await server.app.request(
    "/api/split/expenses",
    json("POST", { id: newId(), ...fields(overrides) }, as.headers),
  )
  expect(response.status).toBe(201)
  return expenseRow.parse(await response.json())
}

function put(expenseId: string, body: unknown, as: Headers = ben.headers) {
  return server.app.request(`/api/split/expenses/${expenseId}`, json("PUT", body, as))
}

async function changed(expenseId: string, body: unknown, as = ben) {
  const response = await put(expenseId, body, as.headers)
  expect(response.status).toBe(200)
  return expenseRow.parse(await response.json())
}

function remove(expenseId: string, as: Headers = ben.headers) {
  return server.app.request(`/api/split/expenses/${expenseId}`, { method: "DELETE", headers: as })
}

async function listed(expenseId: string): Promise<ExpenseRow | undefined> {
  const response = await server.app.request("/api/split/expenses", { headers: admin.headers })
  expect(response.status).toBe(200)
  return expenseRows.parse(await response.json()).rows.find((row) => row.id === expenseId)
}

/** The Admin sets which Apps an Account holds, from the Accounts screen. */
async function setApps(as: Signed, apps: string[]) {
  const response = await server.app.request(
    `/api/admin/accounts/${as.id}/apps`,
    json("PUT", { apps }, admin.headers),
  )
  expect(response.status).toBe(200)
}

describe("App access", () => {
  test("an Account without App access to Split can't change or delete an Expense", async () => {
    const expense = await created()
    expect((await put(expense.id, fields({ total: 1 }), noAccess)).status).toBe(403)
    expect((await remove(expense.id, noAccess)).status).toBe(403)
    expect(await listed(expense.id)).toEqual(expense)
  })
})

describe("update", () => {
  test("any Member replaces the whole Expense, and it records who changed it and when", async () => {
    const expense = await created({ note: "Paid at the till" })
    const edited = await changed(
      expense.id,
      fields({
        description: "  Weekly shop ",
        date: "2026-10-30",
        categoryId: groceries.id,
        total: 1_001,
        note: "",
        paid: equalSide([ben.id]),
        owed: equalSide([ben.id, ana.id]),
      }),
    )
    expect(edited).toMatchObject({
      id: expense.id,
      description: "Weekly shop",
      date: "2026-10-30",
      categoryId: groceries.id,
      total: 1_001,
      note: "",
      paid: equalSide([ben.id]),
      owed: equalSide([ben.id, ana.id]),
      // The shares are worked out again; the Admin's old Owed share is gone.
      paidShares: { [ben.id]: 1_001 },
      owedShares: { [ana.id]: 501, [ben.id]: 500 },
      addedBy: ana.id,
      addedAt: expense.addedAt,
      changedBy: ben.id,
    })
    expect(Date.parse(edited.changedAt)).toBeGreaterThan(Date.parse(expense.addedAt))
    expect(await listed(expense.id)).toEqual(edited)
  })

  test("two Members saving the same Expense: the last save wins for the whole record", async () => {
    const expense = await created()
    // Both opened it as it was. Ben saves first; Ana, who never saw his change, saves after.
    const bens = await changed(
      expense.id,
      fields({ description: "Ben's shop", total: 6_000, owed: equalSide([ben.id, ana.id]) }),
      ben,
    )
    const anas = await changed(
      expense.id,
      fields({ note: "Ana's note", paid: equalSide([ana.id, admin.id]) }),
      ana,
    )
    // Nothing of Ben's save is merged in: Ana's whole record replaced it.
    expect(anas).toMatchObject({
      description: "Groceries run",
      total: 9_000,
      note: "Ana's note",
      paid: equalSide([ana.id, admin.id]),
      owed: equalSide([admin.id, ana.id, ben.id]),
      paidShares: { [admin.id]: 4_500, [ana.id]: 4_500 },
      owedShares: { [admin.id]: 3_000, [ana.id]: 3_000, [ben.id]: 3_000 },
      changedBy: ana.id,
    })
    expect(Date.parse(anas.changedAt)).toBeGreaterThanOrEqual(Date.parse(bens.changedAt))
    expect(await listed(expense.id)).toEqual(anas)
  })

  test("turns an Equal Expense into an Exact and Percent Refund, worked out again", async () => {
    const expense = await created()
    const paid = {
      mode: "exact",
      ticked: [],
      // Amounts as typed: the shares take the Refund's sign.
      exact: { [ana.id]: 4_000, [ben.id]: 2_000 },
      percent: {},
    } as const
    const owed = {
      mode: "percent",
      ticked: [],
      exact: {},
      percent: { [admin.id]: "33.33", [ana.id]: "33.33", [ben.id]: "33.34" },
    } as const
    const edited = await changed(expense.id, fields({ total: -6_000, paid, owed }))
    expect(edited).toMatchObject({
      total: -6_000,
      paid,
      owed,
      paidShares: { [ana.id]: -4_000, [ben.id]: -2_000 },
      // $19.998, $19.998 and $20.004: the two largest remainders, the Admin's and Ana's, take the
      // leftover cents.
      owedShares: { [admin.id]: -2_000, [ana.id]: -2_000, [ben.id]: -2_000 },
    })
    expect(await listed(expense.id)).toEqual(edited)
  })

  test("refuses a side that doesn't add up, naming it, and changes nothing", async () => {
    const expense = await created()
    const response = await put(
      expense.id,
      fields({ paid: { mode: "exact", ticked: [], exact: { [ana.id]: 8_000 }, percent: {} } }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_failed",
        details: [{ path: "paid", message: "$10.00 left to assign" }],
      },
    })
    expect(await listed(expense.id)).toEqual(expense)
  })

  test("names every field that blocks the save, and changes nothing", async () => {
    const expense = await created()
    const response = await put(expense.id, fields({ description: " ", paid: equalSide([]) }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_failed",
        details: [
          { path: "description", message: "Add a description" },
          { path: "paid", message: "Tick at least one Member" },
        ],
      },
    })
    expect(await listed(expense.id)).toEqual(expense)
  })

  test("an Expense that's gone answers 404 and is never recreated", async () => {
    const id = newId()
    const response = await put(id, fields())
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
    expect(await listed(id)).toBeUndefined()
  })

  test("keeps an archived Category it already has, but can't move to another", async () => {
    const [kept, other] = await server.db
      .insert(splitCategories)
      .values([{ name: `Kept ${newId()}` }, { name: `Other ${newId()}` }])
      .returning()
    const expense = await created({ categoryId: kept!.id })
    await server.db
      .update(splitCategories)
      .set({ archived: true })
      .where(inArray(splitCategories.id, [kept!.id, other!.id]))
    await changed(expense.id, fields({ categoryId: kept!.id, total: 1_234 }))
    const response = await put(expense.id, fields({ categoryId: other!.id }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { details: [{ path: "categoryId", message: "Pick a Category" }] },
    })
  })
})

describe("an Account that lost App access", () => {
  test("keeps their shares on an edit, and they can be changed or removed", async () => {
    const cy = await account({ apps: ["split"] })
    const expense = await created({ owed: equalSide([ana.id, ben.id, cy.id]) })
    await setApps(cy, [])

    // Their share stays, still among the leftover cents in Account order.
    const kept = await changed(expense.id, fields({ total: 1_000, owed: expense.owed }))
    expect(kept.owedShares).toEqual({ [ana.id]: 334, [ben.id]: 333, [cy.id]: 333 })

    const removed = await changed(expense.id, fields({ owed: equalSide([ana.id, ben.id]) }))
    expect(removed.owedShares).toEqual({ [ana.id]: 4_500, [ben.id]: 4_500 })
  })

  test("is never newly added, naming the side", async () => {
    const dee = await account({ apps: ["split"] })
    const expense = await created()
    await setApps(dee, [])
    const response = await put(expense.id, fields({ paid: equalSide([dee.id]) }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { details: [{ path: "paid", message: "Only Members can be on an Expense" }] },
    })
    expect(await listed(expense.id)).toEqual(expense)
  })

  test("a hidden tick on an Exact or Percent side never brings them in later", async () => {
    const eve = await account({ apps: ["split"] })
    const outsider = await account({ apps: ["notes"] })
    // Ticks kept from before each side left Equally: they name nobody, so nobody is on it.
    const paid = {
      mode: "exact",
      ticked: [ana.id, eve.id, outsider.id],
      exact: { [ana.id]: 9_000 },
      percent: {},
    }
    const owed = {
      mode: "percent",
      ticked: [eve.id, outsider.id],
      exact: {},
      percent: { [ana.id]: "50", [ben.id]: "50" },
    }
    const expense = await created({ paid, owed })
    expect(expense).toMatchObject({
      paidShares: { [ana.id]: 9_000 },
      owedShares: { [ana.id]: 4_500, [ben.id]: 4_500 },
    })
    await setApps(eve, [])

    // Switching back to Equally would tick them: refused on both sides, and nothing changes.
    const response = await put(
      expense.id,
      fields({ paid: { ...paid, mode: "equal" }, owed: { ...owed, mode: "equal" } }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        details: [
          { path: "paid", message: "Only Members can be on an Expense" },
          { path: "owed", message: "Only Members can be on an Expense" },
        ],
      },
    })
    expect(await listed(expense.id)).toEqual(expense)
  })
})

describe("delete", () => {
  test("any Member deletes any Expense for good, shares and all", async () => {
    const expense = await created()
    const response = await remove(expense.id)
    expect(response.status).toBe(200)
    expect(expenseRow.parse(await response.json())).toEqual(expense)
    expect(await listed(expense.id)).toBeUndefined()
    const shares = await server.db
      .select()
      .from(splitShares)
      .where(eq(splitShares.expenseId, expense.id))
    expect(shares).toEqual([])
  })

  test("an Expense that's gone answers 404, and can't be changed back into being", async () => {
    const expense = await created()
    expect((await remove(expense.id)).status).toBe(200)
    const again = await remove(expense.id)
    expect(again.status).toBe(404)
    expect(await again.json()).toMatchObject({ error: { code: "not_found" } })
    expect((await put(expense.id, fields())).status).toBe(404)
    expect(await listed(expense.id)).toBeUndefined()
  })
})

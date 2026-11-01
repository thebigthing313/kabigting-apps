// Former members: Accounts in Split's data that have lost App access or become Removed Accounts.
// They keep their shares and Balance, stay listed, can settle up, and are never newly added.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import {
  editExpenseRoster,
  equalSide,
  householdBalances,
  memberIdsOf,
  resolveExpense,
} from "#shared/split/rules.ts"
import {
  categoryRows,
  expenseRow,
  expenseRows,
  members as membersSchema,
  paymentRows,
  type ExpenseRow,
  type Member,
} from "#shared/split/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

type Signed = { headers: Headers; id: string }

let server: TestServer
let admin: Signed
let ana: Signed
let generalId: string

async function account(options: Parameters<TestServer["signedInAccount"]>[0]): Promise<Signed> {
  const { headers, user } = await server.signedInAccount(options)
  return { headers, id: user.id }
}

beforeAll(async () => {
  server = await createTestServer()
  admin = await account({ role: "admin" })
  ana = await account({ apps: ["split"] })
  const response = await server.app.request("/api/split/categories", { headers: ana.headers })
  const general = categoryRows
    .parse(await response.json())
    .rows.find((row) => row.name === "General")
  if (!general) throw new Error("General is not seeded")
  generalId = general.id
})

afterAll(async () => {
  await server.close()
})

/** The Admin takes away an Account's Apps; it stays able to sign in. */
async function revoke(as: Signed) {
  const response = await server.app.request(
    `/api/admin/accounts/${as.id}/apps`,
    json("PUT", { apps: [] }, admin.headers),
  )
  expect(response.status).toBe(200)
}

/** The Admin makes it a Removed Account, its App access row and all left in place. */
async function removeAccount(as: Signed) {
  const response = await server.app.request(
    `/api/admin/accounts/${as.id}/remove`,
    json("POST", {}, admin.headers),
  )
  expect(response.status).toBe(200)
}

function expenseFields(overrides: Record<string, unknown> = {}) {
  return {
    description: "Groceries run",
    date: "2026-10-31",
    categoryId: generalId,
    total: 9_000,
    note: "",
    paid: equalSide([ana.id]),
    owed: equalSide([ana.id]),
    ...overrides,
  }
}

function postExpense(overrides: Record<string, unknown> = {}) {
  return server.app.request(
    "/api/split/expenses",
    json("POST", { id: newId(), ...expenseFields(overrides) }, ana.headers),
  )
}

async function createdExpense(overrides: Record<string, unknown> = {}): Promise<ExpenseRow> {
  const response = await postExpense(overrides)
  expect(response.status).toBe(201)
  return expenseRow.parse(await response.json())
}

function postPayment(fromId: string, toId: string, amount: number) {
  return server.app.request(
    "/api/split/payments",
    json("POST", { id: newId(), date: "2026-10-31", fromId, toId, amount, note: "" }, ana.headers),
  )
}

async function listed(): Promise<Member[]> {
  const response = await server.app.request("/api/split/members", { headers: ana.headers })
  expect(response.status).toBe(200)
  return membersSchema.parse(await response.json()).rows
}

async function expenses(): Promise<ExpenseRow[]> {
  const response = await server.app.request("/api/split/expenses", { headers: ana.headers })
  return expenseRows.parse(await response.json()).rows
}

async function balanceOf(id: string): Promise<number> {
  const response = await server.app.request("/api/split/payments", { headers: ana.headers })
  const payments = paymentRows.parse(await response.json()).rows
  return householdBalances(await expenses(), payments, [id])[id] ?? 0
}

describe("the Members list", () => {
  test("marks an Account that lost App access as a Former member, keeping its shares and Balance", async () => {
    const cy = await account({ apps: ["split"] })
    const expense = await createdExpense({ owed: equalSide([ana.id, cy.id]) })
    expect(await listed()).toContainEqual(
      expect.objectContaining({ id: cy.id, standing: "member" }),
    )
    await revoke(cy)

    const accounts = await listed()
    expect(accounts).toContainEqual(expect.objectContaining({ id: cy.id, standing: "former" }))
    // Oldest Account first, Former members among the Members.
    const ids = accounts.map((row) => row.id)
    expect(ids.indexOf(admin.id)).toBeLessThan(ids.indexOf(ana.id))
    expect(ids.indexOf(ana.id)).toBeLessThan(ids.indexOf(cy.id))
    expect((await expenses()).find((row) => row.id === expense.id)).toEqual(expense)
    expect(await balanceOf(cy.id)).toBe(-4_500)
  })

  test("marks a Removed Account in Split's data as a Former member", async () => {
    const dee = await account({ apps: ["split"] })
    await createdExpense({ paid: equalSide([dee.id]), owed: equalSide([ana.id]) })
    await removeAccount(dee)
    expect(await listed()).toContainEqual(
      expect.objectContaining({ id: dee.id, standing: "former" }),
    )
    expect(await balanceOf(dee.id)).toBe(9_000)
  })

  test("leaves out an Account Split's data doesn't name, even in a hidden tick", async () => {
    const outsider = await account({ apps: ["notes"] })
    const eve = await account({ apps: ["split"] })
    // The ticks are kept from before the side left Equally; they name nobody.
    await createdExpense({
      paid: {
        mode: "exact",
        ticked: [outsider.id, eve.id],
        exact: { [ana.id]: 9_000 },
        percent: {},
      },
    })
    await revoke(eve)
    const ids = (await listed()).map((row) => row.id)
    expect(ids).not.toContain(outsider.id)
    expect(ids).not.toContain(eve.id)
  })

  test("marks a Former member whose share on a side rounded to nothing", async () => {
    const kim = await account({ apps: ["split"] })
    const lee = await account({ apps: ["split"] })
    // One cent split two ways goes to Ana, the older; Kim is ticked but holds no share.
    await createdExpense({ total: 1, owed: equalSide([ana.id, kim.id]) })
    // Lee's 0.01% of one cent rounds to nothing too.
    await createdExpense({
      total: 1,
      owed: {
        mode: "percent",
        ticked: [],
        exact: {},
        percent: { [ana.id]: "99.99", [lee.id]: "0.01" },
      },
    })
    await revoke(kim)
    await revoke(lee)
    const accounts = await listed()
    expect(accounts).toContainEqual(expect.objectContaining({ id: kim.id, standing: "former" }))
    expect(accounts).toContainEqual(expect.objectContaining({ id: lee.id, standing: "former" }))
  })

  test("names who only added an entry after they lost App access, as an author", async () => {
    const fay = await account({ apps: ["split"] })
    const response = await server.app.request(
      "/api/split/expenses",
      json("POST", { id: newId(), ...expenseFields() }, fay.headers),
    )
    expect(response.status).toBe(201)
    await revoke(fay)
    expect(await listed()).toContainEqual({
      id: fay.id,
      name: expect.any(String),
      standing: "author",
    })
    // With no Balance, there is nothing to settle with them.
    const refused = await postPayment(ana.id, fay.id, 1_000)
    expect(refused.status).toBe(400)
  })
})

describe("a Payment", () => {
  test("to or from a Former member can be recorded, settling their Balance to zero", async () => {
    const gus = await account({ apps: ["split"] })
    await createdExpense({ owed: equalSide([ana.id, gus.id]) })
    await revoke(gus)
    expect((await postPayment(gus.id, ana.id, 4_500)).status).toBe(201)
    expect(await balanceOf(gus.id)).toBe(0)
    expect((await postPayment(ana.id, gus.id, 1_000)).status).toBe(201)
    expect(await balanceOf(gus.id)).toBe(-1_000)
  })

  test("to an Account Split's data doesn't name is refused", async () => {
    const outsider = await account({ apps: ["notes"] })
    const response = await postPayment(ana.id, outsider.id, 1_000)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { details: [{ path: "toId", message: "Only Members can be on a Payment" }] },
    })
  })
})

describe("an Expense", () => {
  test("a new one naming a Former member is refused, naming the side", async () => {
    const hal = await account({ apps: ["split"] })
    await createdExpense({ owed: equalSide([ana.id, hal.id]) })
    await revoke(hal)
    const response = await postExpense({
      paid: equalSide([hal.id]),
      owed: equalSide([ana.id, hal.id]),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        details: [
          { path: "paid", message: "Only Members can be on an Expense" },
          { path: "owed", message: "Only Members can be on an Expense" },
        ],
      },
    })
  })

  test("an edit hands leftover cents out in the Members list's order, Former members included", async () => {
    const ivy = await account({ apps: ["split"] })
    const jo = await account({ apps: ["split"] })
    const expense = await createdExpense({ owed: equalSide([jo.id, ivy.id]) })
    await revoke(ivy)

    const changes = expenseFields({ total: 1_001, owed: equalSide([jo.id, ivy.id]) })
    const response = await server.app.request(
      `/api/split/expenses/${expense.id}`,
      json("PUT", changes, ana.headers),
    )
    expect(response.status).toBe(200)
    const stored = expenseRow.parse(await response.json())
    // Ivy is the older Account, so the leftover cent is hers, as the client works it out.
    expect(stored.owedShares).toEqual({ [ivy.id]: 501, [jo.id]: 500 })
    const accounts = await listed()
    const roster = editExpenseRoster(
      accounts.map((row) => row.id),
      memberIdsOf(accounts),
      expense,
    )
    expect(resolveExpense(changes, roster)).toMatchObject({
      ok: true,
      paidShares: stored.paidShares,
      owedShares: stored.owedShares,
    })
  })
})

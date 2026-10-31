import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { SEEDED_CATEGORY_NAMES } from "#shared/split/categories.ts"
import { equalSide } from "#shared/split/rules.ts"
import {
  categoryRows,
  expenseRow,
  expenseRows,
  members as membersSchema,
  type CategoryRow,
  type ExpenseRow,
} from "#shared/split/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let admin: { headers: Headers; id: string }
let ana: { headers: Headers; id: string }
let ben: { headers: Headers; id: string }
let noAccess: Headers
let general: CategoryRow

beforeAll(async () => {
  server = await createTestServer()
  const signedInAdmin = await server.signedInAccount({ role: "admin" })
  admin = { headers: signedInAdmin.headers, id: signedInAdmin.user.id }
  const signedInAna = await server.signedInAccount({ apps: ["split"] })
  ana = { headers: signedInAna.headers, id: signedInAna.user.id }
  const signedInBen = await server.signedInAccount({ apps: ["split", "notes"] })
  ben = { headers: signedInBen.headers, id: signedInBen.user.id }
  noAccess = (await server.signedInAccount({ apps: ["finances", "notes"] })).headers
  const found = (await categories()).find((category) => category.name === "General")
  if (!found) throw new Error("General is not seeded")
  general = found
})

afterAll(async () => {
  await server.close()
})

async function categories(as = ana.headers): Promise<CategoryRow[]> {
  const response = await server.app.request("/api/split/categories", { headers: as })
  expect(response.status).toBe(200)
  return categoryRows.parse(await response.json()).rows
}

async function memberIds(as = ana.headers): Promise<string[]> {
  const response = await server.app.request("/api/split/members", { headers: as })
  expect(response.status).toBe(200)
  return membersSchema.parse(await response.json()).rows.map((member) => member.id)
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    id: newId(),
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

function create(payload: unknown, as = ana.headers) {
  return server.app.request("/api/split/expenses", json("POST", payload, as))
}

async function created(overrides: Record<string, unknown> = {}, as = ana.headers) {
  const response = await create(body(overrides), as)
  expect(response.status).toBe(201)
  return expenseRow.parse(await response.json())
}

async function list(as = ana.headers): Promise<ExpenseRow[]> {
  const response = await server.app.request("/api/split/expenses", { headers: as })
  expect(response.status).toBe(200)
  return expenseRows.parse(await response.json()).rows
}

describe("App access", () => {
  test("an Account without App access to Split is refused every route", async () => {
    const refused = [
      await server.app.request("/api/split/expenses", { headers: noAccess }),
      await create(body(), noAccess),
      await server.app.request("/api/split/categories", { headers: noAccess }),
      await server.app.request("/api/split/members", { headers: noAccess }),
    ]
    expect(refused.map((response) => response.status)).toEqual([403, 403, 403, 403])
    for (const response of refused) {
      expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
    }
  })

  test("signed out, every route is 401", async () => {
    expect((await server.app.request("/api/split/expenses")).status).toBe(401)
    const id = newId()
    expect((await create(body({ id }), new Headers())).status).toBe(401)
    expect((await list()).some((row) => row.id === id)).toBe(false)
  })
})

describe("Members", () => {
  test("are the Admin plus every Account holding Split, oldest Account first", async () => {
    const ids = await memberIds()
    expect(ids).toEqual([admin.id, ana.id, ben.id])
  })
})

describe("Categories", () => {
  test("the twelve are seeded, none archived", async () => {
    const rows = await categories()
    expect(rows.map((category) => category.name).toSorted()).toEqual(
      [...SEEDED_CATEGORY_NAMES].toSorted(),
    )
    expect(rows.every((category) => !category.archived)).toBe(true)
  })
})

describe("create", () => {
  test("stores an equal Expense with the shares worked out by the server", async () => {
    const id = newId()
    const expense = await created({ id, note: "  Paid at the till  " })
    expect(expense).toMatchObject({
      id,
      description: "Groceries run",
      date: "2026-10-31",
      categoryId: general.id,
      total: 9_000,
      note: "Paid at the till",
      paid: equalSide([ana.id]),
      owed: equalSide([admin.id, ana.id, ben.id]),
      paidShares: { [ana.id]: 9_000 },
      owedShares: { [admin.id]: 3_000, [ana.id]: 3_000, [ben.id]: 3_000 },
      addedBy: ana.id,
      changedBy: ana.id,
    })
    expect(expense.changedAt).toBe(expense.addedAt)
    expect((await list(ben.headers)).find((row) => row.id === id)).toEqual(expense)
  })

  test("leftover cents go to the oldest Accounts first", async () => {
    const [oldest, middle, newest] = await memberIds()
    const expense = await created({ total: 1_001, owed: equalSide([newest!, middle!, oldest!]) })
    expect(expense.owedShares).toEqual({ [oldest!]: 334, [middle!]: 334, [newest!]: 333 })
  })

  test("the Admin is a Member without an access row", async () => {
    const expense = await created({ paid: equalSide([admin.id]) }, admin.headers)
    expect(expense).toMatchObject({ addedBy: admin.id, paidShares: { [admin.id]: 9_000 } })
  })

  test("names every field that blocks the save, and stores nothing", async () => {
    const id = newId()
    const response = await create(body({ id, description: " ", total: 0, owed: equalSide([]) }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_failed",
        details: [
          { path: "description", message: "Add a description" },
          { path: "total", message: "Enter a total other than zero" },
          { path: "owed", message: "Tick at least one Member" },
        ],
      },
    })
    expect((await list()).some((row) => row.id === id)).toBe(false)
  })

  test("refuses an Account without App access to Split on either side", async () => {
    const outsider = (await server.signedInAccount({ apps: ["notes"] })).user.id
    const response = await create(body({ owed: equalSide([ana.id, outsider]) }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { details: [{ path: "owed", message: "Only Members can be on an Expense" }] },
    })
  })

  test("refuses an unknown Category", async () => {
    const response = await create(body({ categoryId: newId() }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { details: [{ path: "categoryId", message: "Pick a Category" }] },
    })
  })

  test("each side keeps its own Split mode, with the shares worked out by the server", async () => {
    const paid = {
      mode: "exact",
      ticked: [ana.id],
      exact: { [ana.id]: 6_000, [ben.id]: 3_001, [admin.id]: null },
      percent: {},
    } as const
    const owed = {
      mode: "percent",
      ticked: [],
      exact: {},
      percent: { [admin.id]: "33.33", [ana.id]: "33.33", [ben.id]: "33.34" },
    } as const
    const expense = await created({ total: 9_001, paid, owed })
    expect(expense).toMatchObject({
      paid,
      owed,
      paidShares: { [ana.id]: 6_000, [ben.id]: 3_001 },
      // Each percent of $90.01 comes to $30.00 and a fraction; Ben's 33.34% leaves the largest
      // remainder, so Ben takes the leftover cent.
      owedShares: { [admin.id]: 3_000, [ana.id]: 3_000, [ben.id]: 3_001 },
    })
    expect((await list(ben.headers)).find((row) => row.id === expense.id)).toEqual(expense)
  })

  test("a negative total stores a Refund, with negative shares", async () => {
    const expense = await created({
      total: -3_000,
      owed: {
        mode: "exact",
        ticked: [],
        exact: { [ana.id]: -1_000, [ben.id]: -2_000 },
        percent: {},
      },
    })
    expect(expense).toMatchObject({
      total: -3_000,
      paidShares: { [ana.id]: -3_000 },
      owedShares: { [ana.id]: -1_000, [ben.id]: -2_000 },
    })
  })

  test("refuses sides that don't add up to the total, naming the problem", async () => {
    const id = newId()
    const response = await create(
      body({
        id,
        paid: { mode: "exact", ticked: [], exact: { [ana.id]: 8_000 }, percent: {} },
        owed: {
          mode: "percent",
          ticked: [],
          exact: {},
          percent: { [ana.id]: "50", [ben.id]: "45.5" },
        },
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_failed",
        details: [
          { path: "paid", message: "$10.00 left to assign" },
          { path: "owed", message: "4.5% left to assign" },
        ],
      },
    })
    expect((await list()).some((row) => row.id === id)).toBe(false)
  })

  test("refuses exact shares against the sign of the total, and a bad percent", async () => {
    const response = await create(
      body({
        paid: {
          mode: "exact",
          ticked: [],
          exact: { [ana.id]: 10_000, [ben.id]: -1_000 },
          percent: {},
        },
        owed: { mode: "percent", ticked: [], exact: {}, percent: { [ana.id]: "100.001" } },
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        details: [
          { path: "paid", message: "A share can't be negative" },
          { path: "owed", message: "Enter each percent with up to two decimals" },
        ],
      },
    })
  })

  test("never trusts shares sent by the client", async () => {
    const response = await create({ ...body(), paidShares: { [ben.id]: 9_000 } })
    expect(response.status).toBe(400)
  })

  test("a repeated id is a conflict and never overwrites", async () => {
    const first = await created()
    const response = await create(body({ id: first.id, description: "Something else" }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    expect((await list()).find((row) => row.id === first.id)).toEqual(first)
  })
})

describe("list", () => {
  test("every Member sees every Expense, newest date first", async () => {
    const older = await created({ date: "2026-01-02" })
    const newer = await created({ date: "2027-01-02" }, ben.headers)
    const ids = (await list(admin.headers)).map((row) => row.id)
    expect(ids[0]).toBe(newer.id)
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id))
    expect(ids.at(-1)).toBe(older.id)
  })
})

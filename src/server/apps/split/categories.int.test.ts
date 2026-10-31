import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { equalSide } from "#shared/split/rules.ts"
import {
  categoryRow,
  categoryRows,
  expenseRow,
  expenseRows,
  type CategoryRow,
} from "#shared/split/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let ana: { headers: Headers; id: string }
let ben: Headers
let noAccess: Headers

beforeAll(async () => {
  server = await createTestServer()
  const signedInAna = await server.signedInAccount({ apps: ["split"] })
  ana = { headers: signedInAna.headers, id: signedInAna.user.id }
  ben = (await server.signedInAccount({ apps: ["split"] })).headers
  noAccess = (await server.signedInAccount({ apps: ["finances"] })).headers
})

afterAll(async () => {
  await server.close()
})

let counter = 0

/** A made-up Category name no other test uses. */
function uniqueName(): string {
  counter += 1
  return `Board games ${counter}`
}

async function list(as = ana.headers): Promise<CategoryRow[]> {
  const response = await server.app.request("/api/split/categories", { headers: as })
  expect(response.status).toBe(200)
  return categoryRows.parse(await response.json()).rows
}

function create(payload: unknown, as = ana.headers) {
  return server.app.request("/api/split/categories", json("POST", payload, as))
}

async function created(name = uniqueName()): Promise<CategoryRow> {
  const response = await create({ id: newId(), name })
  expect(response.status).toBe(201)
  return categoryRow.parse(await response.json())
}

function patch(categoryId: string, payload: unknown, as = ana.headers) {
  return server.app.request(`/api/split/categories/${categoryId}`, json("PATCH", payload, as))
}

function addExpense(categoryId: string) {
  return server.app.request(
    "/api/split/expenses",
    json(
      "POST",
      {
        id: newId(),
        description: "Card night snacks",
        date: "2026-10-31",
        categoryId,
        total: 2_400,
        note: "",
        paid: equalSide([ana.id]),
        owed: equalSide([ana.id]),
      },
      ana.headers,
    ),
  )
}

describe("App access", () => {
  test("an Account without App access to Split can't add or change a Category", async () => {
    const category = await created()
    const refused = [
      await create({ id: newId(), name: uniqueName() }, noAccess),
      await patch(category.id, { name: uniqueName() }, noAccess),
    ]
    expect(refused.map((response) => response.status)).toEqual([403, 403])
    for (const response of refused) {
      expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
    }
    expect((await list()).find((row) => row.id === category.id)).toEqual(category)
  })
})

describe("create", () => {
  test("adds a Category in use, trimmed, that every Member sees", async () => {
    const id = newId()
    const response = await create({ id, name: "  Board games  " })
    expect(response.status).toBe(201)
    const category = categoryRow.parse(await response.json())
    expect(category).toEqual({ id, name: "Board games", archived: false })
    expect((await list(ben)).find((row) => row.id === id)).toEqual(category)
  })

  test("a taken name, in any case, is a conflict", async () => {
    const id = newId()
    for (const name of ["Groceries", "groceries", " GROCERIES "]) {
      const response = await create({ id, name })
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    }
    expect((await list()).some((row) => row.id === id)).toBe(false)
  })

  test("an archived Category's name is still taken", async () => {
    const category = await created()
    expect((await patch(category.id, { archived: true })).status).toBe(200)
    const response = await create({ id: newId(), name: category.name.toUpperCase() })
    expect(response.status).toBe(409)
  })

  test("a repeated id is a conflict and never overwrites", async () => {
    const first = await created()
    const response = await create({ id: first.id, name: uniqueName() })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    expect((await list()).find((row) => row.id === first.id)).toEqual(first)
  })

  test("a blank name is refused", async () => {
    const response = await create({ id: newId(), name: "   " })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
  })
})

describe("rename", () => {
  test("renames a Category for every Member", async () => {
    const category = await created()
    const name = uniqueName()
    const response = await patch(category.id, { name: ` ${name} ` }, ben)
    expect(response.status).toBe(200)
    expect(categoryRow.parse(await response.json())).toEqual({ ...category, name })
    expect((await list()).find((row) => row.id === category.id)).toEqual({ ...category, name })
  })

  test("a Category can change only the case of its own name", async () => {
    const category = await created()
    const response = await patch(category.id, { name: category.name.toUpperCase() })
    expect(response.status).toBe(200)
    expect(categoryRow.parse(await response.json()).name).toBe(category.name.toUpperCase())
  })

  test("another Category's name, in any case, is a conflict and changes nothing", async () => {
    const category = await created()
    const response = await patch(category.id, { name: "dining OUT" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    expect((await list()).find((row) => row.id === category.id)).toEqual(category)
  })

  test("a Category that doesn't exist is 404", async () => {
    const response = await patch(newId(), { name: uniqueName() })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
  })

  test("an empty change is refused", async () => {
    const category = await created()
    expect((await patch(category.id, {})).status).toBe(400)
  })
})

describe("archive", () => {
  test("keeps the Category, and its Expenses, but refuses it on a new Expense", async () => {
    const category = await created()
    const before = await addExpense(category.id)
    expect(before.status).toBe(201)
    const expense = expenseRow.parse(await before.json())

    const response = await patch(category.id, { archived: true }, ben)
    expect(response.status).toBe(200)
    expect(categoryRow.parse(await response.json())).toEqual({ ...category, archived: true })
    expect((await list()).find((row) => row.id === category.id)).toEqual({
      ...category,
      archived: true,
    })

    const expenses = await server.app.request("/api/split/expenses", { headers: ana.headers })
    const kept = expenseRows.parse(await expenses.json()).rows.find((row) => row.id === expense.id)
    expect(kept?.categoryId).toBe(category.id)

    const after = await addExpense(category.id)
    expect(after.status).toBe(400)
    expect(await after.json()).toMatchObject({
      error: { details: [{ path: "categoryId", message: "Pick a Category" }] },
    })
  })

  test("an archived Category can be put back in use", async () => {
    const category = await created()
    expect((await patch(category.id, { archived: true })).status).toBe(200)
    const response = await patch(category.id, { archived: false })
    expect(response.status).toBe(200)
    expect(categoryRow.parse(await response.json())).toEqual(category)
    expect((await addExpense(category.id)).status).toBe(201)
  })
})

describe("delete", () => {
  test("there is none: a Category is never deleted", async () => {
    const category = await created()
    const response = await server.app.request(`/api/split/categories/${category.id}`, {
      method: "DELETE",
      headers: ana.headers,
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    expect((await list()).find((row) => row.id === category.id)).toEqual(category)
  })
})

import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { categoryRow, categoryRows } from "#shared/finances/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let headers: Headers
let noAccessHeaders: Headers

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
  noAccessHeaders = (await server.signedInAccount()).headers
})

afterAll(async () => {
  await server.close()
})

let counter = 0

/** A made-up Category with a name no other test uses. */
function category(overrides: Partial<{ id: string; name: string }> = {}) {
  counter += 1
  return { id: newId(), name: `Groceries ${counter}`, ...overrides }
}

async function create(body: unknown, as = headers) {
  return server.app.request("/api/finances/categories", json("POST", body, as))
}

async function created(body: unknown) {
  const response = await create(body)
  expect(response.status).toBe(201)
  return categoryRow.parse(await response.json())
}

async function patch(categoryId: string, body: unknown) {
  return server.app.request(`/api/finances/categories/${categoryId}`, json("PATCH", body, headers))
}

async function query(body: unknown = {}) {
  const response = await server.app.request(
    "/api/finances/categories/query",
    json("POST", body, headers),
  )
  expect(response.status).toBe(200)
  return categoryRows.parse(await response.json()).rows
}

test("an Account without Finances access is refused", async () => {
  const response = await create(category(), noAccessHeaders)
  expect(response.status).toBe(403)
})

describe("create", () => {
  test("stores the Category under the client's id and returns the full row", async () => {
    const input = category()
    const row = await created(input)
    expect(row).toMatchObject({ ...input, archived: false, mergedIntoId: null })
    expect(await query({ ids: [input.id] })).toEqual([row])
  })

  test("a taken name, in any case, is 409 conflict", async () => {
    const first = await created(category())
    const response = await create(category({ name: first.name }))
    expect(response.status).toBe(409)
    const differentCase = await create(category({ name: first.name.toUpperCase() }))
    expect(differentCase.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
  })

  test("a client cannot set the merge target", async () => {
    const response = await create({ ...category(), mergedIntoId: newId() })
    expect(response.status).toBe(400)
  })
})

describe("rename", () => {
  test("changes the name and returns the full row", async () => {
    const before = await created(category())
    const response = await patch(before.id, { name: "Dining Out" })
    expect(response.status).toBe(200)
    expect(categoryRow.parse(await response.json())).toMatchObject({
      id: before.id,
      name: "Dining Out",
    })
  })

  test("to a taken name is 409 conflict", async () => {
    const taken = await created(category())
    const other = await created(category())
    const response = await patch(other.id, { name: taken.name })
    expect(response.status).toBe(409)
  })

  test("an unknown id is 404", async () => {
    expect((await patch(newId(), { name: "Nothing" })).status).toBe(404)
  })
})

test("an archived Category is still listed, marked, and can be unarchived", async () => {
  const row = await created(category())
  await patch(row.id, { archived: true })
  expect((await query({ ids: [row.id] }))[0]).toMatchObject({ archived: true })
  const response = await patch(row.id, { archived: false })
  expect(await response.json()).toMatchObject({ archived: false })
})

test("a Category is never deleted: DELETE is 409 conflict and the row stays", async () => {
  const row = await created(category())
  const response = await server.app.request(`/api/finances/categories/${row.id}`, {
    method: "DELETE",
    headers,
  })
  expect(response.status).toBe(409)
  expect(await query({ ids: [row.id] })).toHaveLength(1)
})

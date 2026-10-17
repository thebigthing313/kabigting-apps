import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { accountRow, accountRows } from "#shared/finances/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let headers: Headers
let otherHeaders: Headers
let noAccessHeaders: Headers

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
  otherHeaders = (await server.signedInAccount({ apps: ["finances"] })).headers
  noAccessHeaders = (await server.signedInAccount()).headers
})

afterAll(async () => {
  await server.close()
})

let counter = 0

/** A made-up Account with a name no other test uses. */
function account(overrides: Partial<{ id: string; name: string; note: string }> = {}) {
  counter += 1
  return { id: newId(), name: `Landlord ${counter}`, ...overrides }
}

async function create(body: unknown, as = headers) {
  return server.app.request("/api/finances/accounts", json("POST", body, as))
}

async function created(body: unknown) {
  const response = await create(body)
  expect(response.status).toBe(201)
  return accountRow.parse(await response.json())
}

async function patch(accountId: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/accounts/${accountId}`, json("PATCH", body, as))
}

async function query(body: unknown = {}, as = headers) {
  const response = await server.app.request("/api/finances/accounts/query", json("POST", body, as))
  expect(response.status).toBe(200)
  return accountRows.parse(await response.json()).rows
}

describe("access", () => {
  test("an Account without Finances access is refused", async () => {
    const response = await create(account(), noAccessHeaders)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
  })
})

describe("create", () => {
  test("stores the Account under the client's id, trimmed, and returns the full row", async () => {
    const input = account()
    const row = await created({ ...input, name: `  ${input.name}  ` })
    expect(row).toMatchObject({ id: input.id, name: input.name, note: "", archived: false })
    expect(row.createdAt).toMatch(/Z$/)
    expect(await query({ ids: [input.id] })).toEqual([row])
  })

  test("keeps a note", async () => {
    const input = account({ note: "Rent on the 1st" })
    expect(await created(input)).toMatchObject({ note: "Rent on the 1st" })
  })

  test("a taken name is 409 conflict", async () => {
    const first = await created(account())
    const response = await create(account({ name: first.name }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
  })

  test("a duplicate id is 409 conflict and leaves the original alone", async () => {
    const input = account()
    await created(input)
    const response = await create({ ...input, name: `${input.name} again` })
    expect(response.status).toBe(409)
    expect((await query({ ids: [input.id] }))[0]?.name).toBe(input.name)
  })

  test("a blank name is 400 validation_failed", async () => {
    const response = await create(account({ name: "   " }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
  })
})

describe("query", () => {
  test("is shared household data: everyone with access sees every Account", async () => {
    const input = await created(account())
    const ids = (await query({}, otherHeaders)).map((row) => row.id)
    expect(ids).toContain(input.id)
  })
})

describe("rename", () => {
  test("changes the name and returns the full row", async () => {
    const before = await created(account())
    const response = await patch(before.id, { name: "Power company" })
    expect(response.status).toBe(200)
    const row = accountRow.parse(await response.json())
    expect(row).toMatchObject({ id: before.id, name: "Power company" })
    expect(Date.parse(row.updatedAt)).toBeGreaterThanOrEqual(Date.parse(before.updatedAt))
  })

  test("to a taken name is 409 conflict and keeps the old name", async () => {
    const taken = await created(account())
    const other = await created(account())
    const response = await patch(other.id, { name: taken.name })
    expect(response.status).toBe(409)
    expect((await query({ ids: [other.id] }))[0]?.name).toBe(other.name)
  })

  test("an unknown id is 404", async () => {
    const response = await patch(newId(), { name: "Nobody" })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
  })
})

test("archiving and unarchiving go through PATCH", async () => {
  const row = await created(account())
  expect(await (await patch(row.id, { archived: true })).json()).toMatchObject({ archived: true })
  expect(await (await patch(row.id, { archived: false })).json()).toMatchObject({ archived: false })
})

describe("delete", () => {
  test("removes an Account nothing references and returns it", async () => {
    const row = await created(account())
    const response = await server.app.request(`/api/finances/accounts/${row.id}`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(row)
    expect(await query({ ids: [row.id] })).toEqual([])
  })

  test("an unknown id is 404", async () => {
    const response = await server.app.request(`/api/finances/accounts/${newId()}`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(404)
  })
})

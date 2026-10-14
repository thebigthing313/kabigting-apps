import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { z } from "zod"
import { noteRow, noteRows } from "#shared/schemas/skeleton.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let headers: Headers
let otherHeaders: Headers

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["skeleton"] })).headers
  otherHeaders = (await server.signedInAccount({ apps: ["skeleton"] })).headers
})

afterAll(async () => {
  await server.close()
})

function note(
  overrides: Partial<{ id: string; text: string; amountCents: number; onDate: string }> = {},
) {
  return { id: newId(), text: "Groceries", amountCents: -4520, onDate: "2026-10-14", ...overrides }
}

async function create(body: unknown, as = headers) {
  return server.app.request("/api/skeleton/notes", json("POST", body, as))
}

const errorBody = z.object({
  error: z.object({ code: z.string(), details: z.array(z.object({ path: z.string() })) }),
})

async function query(body: unknown = {}, as = headers) {
  const response = await server.app.request("/api/skeleton/notes/query", json("POST", body, as))
  expect(response.status).toBe(200)
  return noteRows.parse(await response.json()).rows
}

describe("create", () => {
  test("stores the note under the client's id and returns the full row", async () => {
    const input = note()
    const response = await create(input)
    expect(response.status).toBe(201)
    const row = noteRow.parse(await response.json())
    expect(row).toMatchObject(input)
    expect(row.createdAt).toMatch(/Z$/)
    expect(await query({ ids: [input.id] })).toEqual([row])
  })

  test("a duplicate id is 409 conflict and leaves the original alone", async () => {
    const input = note()
    await create(input)
    const response = await create({ ...input, text: "Overwrite attempt" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    expect((await query({ ids: [input.id] }))[0]?.text).toBe("Groceries")
  })

  test("an invalid body is 400 validation_failed with per-field details", async () => {
    const response = await create({ ...note(), amountCents: 1.5, extra: true })
    expect(response.status).toBe(400)
    const body = errorBody.parse(await response.json())
    expect(body.error.code).toBe("validation_failed")
    expect(body.error.details.length).toBeGreaterThan(0)
  })
})

describe("query", () => {
  test("returns only the signed-in Account's notes", async () => {
    const mine = note()
    const theirs = note()
    await create(mine)
    await create(theirs, otherHeaders)
    const ids = (await query()).map((r) => r.id)
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)
  })

  test("pages by id with limit and after", async () => {
    const all = await query()
    const [first, second] = all
    expect(await query({ limit: 1 })).toEqual([first])
    expect((await query({ limit: 1, after: first!.id }))[0]).toEqual(second)
  })
})

describe("update", () => {
  test("changes only the given fields and returns the full row", async () => {
    const input = note()
    const created = noteRow.parse(await (await create(input)).json())
    const response = await server.app.request(
      `/api/skeleton/notes/${input.id}`,
      json("PATCH", { amountCents: 100 }, headers),
    )
    expect(response.status).toBe(200)
    const row = noteRow.parse(await response.json())
    expect(row).toMatchObject({ ...input, amountCents: 100 })
    expect(Date.parse(row.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt))
  })

  test("another Account's note is 404", async () => {
    const input = note()
    await create(input, otherHeaders)
    const response = await server.app.request(
      `/api/skeleton/notes/${input.id}`,
      json("PATCH", { text: "Mine now" }, headers),
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
  })

  test("a malformed id is 400", async () => {
    const response = await server.app.request(
      "/api/skeleton/notes/not-a-uuid",
      json("PATCH", { text: "x" }, headers),
    )
    expect(response.status).toBe(400)
  })
})

describe("delete", () => {
  test("removes the note and returns the deleted row", async () => {
    const input = note()
    await create(input)
    const response = await server.app.request(`/api/skeleton/notes/${input.id}`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject(input)
    expect(await query({ ids: [input.id] })).toEqual([])
  })

  test("another Account's note is 404 and survives", async () => {
    const input = note()
    await create(input, otherHeaders)
    const response = await server.app.request(`/api/skeleton/notes/${input.id}`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(404)
    expect(await query({ ids: [input.id] }, otherHeaders)).toHaveLength(1)
  })
})

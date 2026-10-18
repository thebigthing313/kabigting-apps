import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import {
  categoryMergeResult,
  categoryRow,
  categoryRows,
  scheduleRows,
  transactionRows,
  walletRow,
} from "#shared/finances/schemas.ts"
import { financesTransactions } from "#server/db/schema/index.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let headers: Headers
let noAccessHeaders: Headers
let adminHeaders: Headers

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
  noAccessHeaders = (await server.signedInAccount()).headers
  adminHeaders = (await server.signedInAccount({ role: "admin" })).headers
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

async function query(body: unknown = {}, as = headers) {
  const response = await server.app.request(
    "/api/finances/categories/query",
    json("POST", body, as),
  )
  expect(response.status).toBe(200)
  return categoryRows.parse(await response.json()).rows
}

test("an Account without Finances access is refused", async () => {
  const response = await create(category(), noAccessHeaders)
  expect(response.status).toBe(403)
})

test("the Admin, with no access row, adds and reads Categories", async () => {
  const input = category()
  expect((await create(input, adminHeaders)).status).toBe(201)
  expect((await query({ ids: [input.id] }, adminHeaders)).map((row) => row.id)).toEqual([input.id])
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

function merge(categoryId: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/categories/${categoryId}/merge`, json("POST", body, as))
}

async function post(path: string, body: Record<string, unknown>) {
  const response = await server.app.request(
    `/api/finances/${path}`,
    json("POST", { id: newId(), ...body }, headers),
  )
  expect(response.status).toBe(201)
}

async function transactionsIn(categoryId: string) {
  const response = await server.app.request(
    "/api/finances/transactions/query",
    json("POST", { categoryId, includeIgnored: true }, headers),
  )
  return transactionRows.parse(await response.json()).rows
}

async function schedulesIn(categoryId: string) {
  const response = await server.app.request(
    "/api/finances/schedules/query",
    json("POST", {}, headers),
  )
  return scheduleRows
    .parse(await response.json())
    .rows.filter((row) => row.categoryId === categoryId)
}

describe("merge", () => {
  let walletId: string

  beforeAll(async () => {
    const response = await server.app.request(
      "/api/finances/wallets",
      json("POST", { id: newId(), name: "Merge test checking" }, headers),
    )
    walletId = walletRow.parse(await response.json()).id
  })

  test("moves Transactions and Schedule defaults to the target and archives the source", async () => {
    const source = await created(category())
    const target = await created(category())
    const untouched = await created(category())
    const row = { walletId, categoryId: source.id }
    await post("transactions", { ...row, status: "actual", date: "2026-09-01", amountCents: -500 })
    await post("transactions", { ...row, status: "planned", date: "2026-12-01", amountCents: -900 })
    await post("transactions", {
      walletId,
      categoryId: untouched.id,
      status: "actual",
      date: "2026-09-02",
      amountCents: -100,
    })
    await post("schedules", {
      ...row,
      amountCents: -2_000,
      unit: "month",
      every: 1,
      startDate: "2026-10-01",
    })

    const response = await merge(source.id, { intoId: target.id })
    expect(response.status).toBe(200)
    const result = categoryMergeResult.parse(await response.json())

    expect(result.categories).toEqual([
      expect.objectContaining({ id: source.id, archived: true, mergedIntoId: target.id }),
    ])
    expect(result.transactions.map((moved) => moved.categoryId)).toEqual([target.id, target.id])
    expect(result.schedules.map((moved) => moved.categoryId)).toEqual([target.id])
    expect(await transactionsIn(source.id)).toEqual([])
    expect(await transactionsIn(target.id)).toHaveLength(2)
    expect(await transactionsIn(untouched.id)).toHaveLength(1)
    expect(await schedulesIn(source.id)).toEqual([])
    expect(await schedulesIn(target.id)).toHaveLength(1)
    expect((await query({ ids: [source.id] }))[0]).toMatchObject({
      archived: true,
      mergedIntoId: target.id,
    })
  })

  test("an ignored line and a Reconciled one-off move and keep their state", async () => {
    const source = await created(category())
    const target = await created(category())
    const [imported] = await server.db
      .insert(financesTransactions)
      .values({
        status: "actual",
        walletId,
        date: "2026-09-10",
        amountCents: -1_200,
        categoryId: source.id,
        source: "ofx",
        sourceKey: `FITID-${newId()}`,
        bankDescription: "MADE-UP STORE",
      })
      .returning()
    const deleted = await server.app.request(`/api/finances/transactions/${imported!.id}`, {
      method: "DELETE",
      headers,
    })
    expect(deleted.status).toBe(200)
    const plannedId = newId()
    const actualId = newId()
    const row = { walletId, categoryId: source.id, date: "2026-09-11", amountCents: -800 }
    await post("transactions", { ...row, id: plannedId, status: "planned" })
    await post("transactions", { ...row, id: actualId, status: "actual" })
    const reconciled = await server.app.request(
      "/api/finances/reconcile",
      json("POST", { plannedKind: "transaction", plannedRef: plannedId, actualId }, headers),
    )
    expect(reconciled.status).toBe(200)

    expect((await merge(source.id, { intoId: target.id })).status).toBe(200)

    const moved = new Map((await transactionsIn(target.id)).map((each) => [each.id, each]))
    expect(moved.get(imported!.id)).toMatchObject({ ignored: true })
    expect(moved.get(plannedId)).toMatchObject({ reconciledActualId: actualId })
    expect(moved.get(actualId)).toMatchObject({ categoryId: target.id })
  })

  test("the Admin, with no access row, merges; an Account without access is refused", async () => {
    const source = await created(category())
    const target = await created(category())
    expect((await merge(source.id, { intoId: target.id }, noAccessHeaders)).status).toBe(403)
    expect((await merge(source.id, { intoId: target.id }, adminHeaders)).status).toBe(200)
  })

  test("into itself or an unknown Category is 400; an unknown source is 404", async () => {
    const source = await created(category())
    expect((await merge(source.id, { intoId: source.id })).status).toBe(400)
    expect((await merge(source.id, { intoId: newId() })).status).toBe(400)
    expect((await merge(newId(), { intoId: source.id })).status).toBe(404)
    expect((await merge(source.id, { intoId: source.id, extra: 1 })).status).toBe(400)
  })

  test("a Category already merged, or a target that is archived, is 409 conflict", async () => {
    const source = await created(category())
    const target = await created(category())
    const other = await created(category())
    expect((await merge(source.id, { intoId: target.id })).status).toBe(200)
    expect((await merge(source.id, { intoId: other.id })).status).toBe(409)
    // A merged Category is archived, so nothing merges into it either.
    expect((await merge(other.id, { intoId: source.id })).status).toBe(409)
    const archived = await created(category())
    await patch(archived.id, { archived: true })
    expect((await merge(other.id, { intoId: archived.id })).status).toBe(409)
  })
})

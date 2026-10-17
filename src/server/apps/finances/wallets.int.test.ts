import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { financesWallets } from "#server/db/schema/index.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import { walletRow, walletRows } from "#shared/finances/schemas.ts"
import { newId } from "#shared/ids.ts"

let server: TestServer
let headers: Headers
let otherHeaders: Headers

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
  otherHeaders = (await server.signedInAccount({ apps: ["finances"] })).headers
})

afterAll(async () => {
  await server.close()
})

let counter = 0

function wallet(overrides: Record<string, unknown> = {}) {
  counter += 1
  return { id: newId(), name: `Test wallet ${counter}`, ...overrides }
}

function create(body: unknown, as = headers) {
  return server.app.request("/api/finances/wallets", json("POST", body, as))
}

async function created(overrides: Record<string, unknown> = {}) {
  const response = await create(wallet(overrides))
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json())
}

function patch(id: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/wallets/${id}`, json("PATCH", body, as))
}

function remove(id: string, as = headers) {
  return server.app.request(`/api/finances/wallets/${id}`, { method: "DELETE", headers: as })
}

async function query(body: unknown = {}, as = headers) {
  const response = await server.app.request("/api/finances/wallets/query", json("POST", body, as))
  expect(response.status).toBe(200)
  return walletRows.parse(await response.json()).rows
}

describe("access", () => {
  test("without Finances access every Wallet route is 403 forbidden_app", async () => {
    const guest = (await server.signedInAccount({ apps: [] })).headers
    const { id } = await created()
    const responses = [
      await server.app.request("/api/finances/wallets/query", json("POST", {}, guest)),
      await create(wallet(), guest),
      await patch(id, { name: "Taken over" }, guest),
      await remove(id, guest),
    ]
    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
    }
  })

  test("the Admin reaches the Wallet routes without an access row", async () => {
    const admin = (await server.signedInAccount({ role: "admin" })).headers
    const response = await server.app.request(
      "/api/finances/wallets/query",
      json("POST", {}, admin),
    )
    expect(response.status).toBe(200)
  })

  test("without a session they are 401", async () => {
    const response = await server.app.request("/api/finances/wallets/query", json("POST", {}))
    expect(response.status).toBe(401)
  })
})

describe("create", () => {
  test("stores the Wallet under the client's id with the documented defaults", async () => {
    const input = wallet()
    const response = await create(input)
    expect(response.status).toBe(201)
    const row = walletRow.parse(await response.json())
    expect(row).toMatchObject({
      ...input,
      inForecast: false,
      lowBalanceThresholdCents: 0,
      shownAsOwed: false,
      bankAccountLast4: null,
      archived: false,
    })
    expect(row.createdAt).toMatch(/Z$/)
    expect(await query({ ids: [input.id] })).toEqual([row])
  })

  test("takes every setting at once", async () => {
    const row = await created({
      inForecast: true,
      lowBalanceThresholdCents: -500_000,
      shownAsOwed: true,
    })
    expect(row).toMatchObject({
      inForecast: true,
      lowBalanceThresholdCents: -500_000,
      shownAsOwed: true,
    })
  })

  test("a duplicate id is 409 conflict and leaves the original alone", async () => {
    const input = wallet()
    await create(input)
    const response = await create({ ...input, name: "Another name" })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    expect((await query({ ids: [input.id] }))[0]?.name).toBe(input.name)
  })

  test("a name already in use, in any case, is 409 conflict", async () => {
    const first = await created()
    for (const name of [first.name, first.name.toUpperCase()]) {
      const response = await create(wallet({ name }))
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    }
  })

  test("an empty name, a fractional Amount or an unknown field is 400 validation_failed", async () => {
    for (const body of [
      wallet({ name: "   " }),
      wallet({ lowBalanceThresholdCents: 1.5 }),
      wallet({ archived: true }),
      wallet({ bankAccountLast4: "1234" }),
    ]) {
      const response = await create(body)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
    }
  })
})

describe("query", () => {
  test("every Account with Finances access sees the same household Wallets", async () => {
    const mine = await created()
    const theirs = await created()
    const seenByOther = (await query({}, otherHeaders)).map((r) => r.id)
    expect(seenByOther).toEqual(expect.arrayContaining([mine.id, theirs.id]))
  })

  test("includes archived Wallets, for the Show archived toggle", async () => {
    const row = await created()
    await patch(row.id, { archived: true })
    expect((await query({ ids: [row.id] }))[0]?.archived).toBe(true)
  })

  test("pages by id with limit and after", async () => {
    await created()
    await created()
    const [first, second] = await query()
    expect(await query({ limit: 1 })).toEqual([first])
    expect((await query({ limit: 1, after: first!.id }))[0]).toEqual(second)
  })

  test("rejects a filter it does not know", async () => {
    const response = await server.app.request(
      "/api/finances/wallets/query",
      json("POST", { archived: false }, headers),
    )
    expect(response.status).toBe(400)
  })
})

describe("update", () => {
  test("changes each Settings field and returns the full row", async () => {
    const row = await created()
    const response = await patch(row.id, {
      name: `${row.name} renamed`,
      inForecast: true,
      lowBalanceThresholdCents: 25_000,
      shownAsOwed: true,
      archived: true,
    })
    expect(response.status).toBe(200)
    const updated = walletRow.parse(await response.json())
    expect(updated).toMatchObject({
      id: row.id,
      name: `${row.name} renamed`,
      inForecast: true,
      lowBalanceThresholdCents: 25_000,
      shownAsOwed: true,
      archived: true,
    })
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(row.updatedAt))
    expect(await query({ ids: [row.id] })).toEqual([updated])
  })

  test("another Account with access may change a household Wallet", async () => {
    const row = await created()
    const response = await patch(row.id, { inForecast: true }, otherHeaders)
    expect(response.status).toBe(200)
  })

  test("Forget clears the remembered bank account", async () => {
    const row = await created()
    await server.db
      .update(financesWallets)
      .set({ bankAccountHash: `hash-${row.id}`, bankAccountLast4: "4321" })
      .where(eq(financesWallets.id, row.id))
    expect((await query({ ids: [row.id] }))[0]?.bankAccountLast4).toBe("4321")

    const response = await patch(row.id, { bankAccountLast4: null })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ bankAccountLast4: null })
    const [stored] = await server.db
      .select()
      .from(financesWallets)
      .where(eq(financesWallets.id, row.id))
    expect(stored?.bankAccountHash).toBeNull()
  })

  test("a bank account cannot be set by hand", async () => {
    const row = await created()
    expect((await patch(row.id, { bankAccountLast4: "9999" })).status).toBe(400)
  })

  test("a Wallet can change the case of its own name", async () => {
    const row = await created()
    const response = await patch(row.id, { name: row.name.toUpperCase() })
    expect(response.status).toBe(200)
  })

  test("renaming to a name already in use, in any case, is 409 conflict", async () => {
    const first = await created()
    const second = await created()
    expect((await patch(second.id, { name: first.name.toLowerCase() })).status).toBe(409)
    const response = await patch(second.id, { name: first.name })
    expect(response.status).toBe(409)
  })

  test("an empty patch is 400 and an unknown id is 404", async () => {
    const row = await created()
    expect((await patch(row.id, {})).status).toBe(400)
    const response = await patch(newId(), { name: "Nowhere" })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
  })

  test("a malformed id is 400", async () => {
    expect((await patch("not-a-uuid", { name: "x" })).status).toBe(400)
  })
})

describe("delete", () => {
  test("removes a Wallet nothing refers to and returns the deleted row", async () => {
    const row = await created()
    const response = await remove(row.id)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: row.id, name: row.name })
    expect(await query({ ids: [row.id] })).toEqual([])
  })

  test("an unknown id is 404", async () => {
    expect((await remove(newId())).status).toBe(404)
  })
})

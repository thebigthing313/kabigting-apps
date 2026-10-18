import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import { settingsRow, settingsRows, walletRow } from "#shared/finances/schemas.ts"
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

async function wallet(overrides: Record<string, unknown> = {}) {
  counter += 1
  const body = { id: newId(), name: `Settings wallet ${counter}`, inForecast: true, ...overrides }
  const response = await server.app.request("/api/finances/wallets", json("POST", body, headers))
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json())
}

function patch(body: unknown, as = headers, id = "household") {
  return server.app.request(`/api/finances/settings/${id}`, json("PATCH", body, as))
}

async function query(as = headers) {
  const response = await server.app.request("/api/finances/settings/query", json("POST", {}, as))
  expect(response.status).toBe(200)
  return settingsRows.parse(await response.json()).rows
}

describe("access", () => {
  test("without Finances access the settings routes are 403 forbidden_app", async () => {
    const guest = (await server.signedInAccount({ apps: [] })).headers
    const responses = [
      await server.app.request("/api/finances/settings/query", json("POST", {}, guest)),
      await patch({ openOnHomeWalletId: null }, guest),
    ]
    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
    }
  })

  test("the Admin reaches the settings routes without an access row", async () => {
    const admin = (await server.signedInAccount({ role: "admin" })).headers
    expect(await query(admin)).toHaveLength(1)
    const response = await patch({ openOnHomeWalletId: null }, admin)
    expect(response.status).toBe(200)
  })

  test("without a session they are 401", async () => {
    const response = await server.app.request("/api/finances/settings/query", json("POST", {}))
    expect(response.status).toBe(401)
  })
})

describe("query", () => {
  test("returns the household's one row", async () => {
    const rows = await query()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe("household")
  })

  test("rejects a filter", async () => {
    const response = await server.app.request(
      "/api/finances/settings/query",
      json("POST", { ids: ["household"] }, headers),
    )
    expect(response.status).toBe(400)
  })
})

describe("open on home", () => {
  test("a forecast Wallet becomes everyone's default, and null puts it back on All", async () => {
    const { id } = await wallet()
    const response = await patch({ openOnHomeWalletId: id })
    expect(response.status).toBe(200)
    const row = settingsRow.parse(await response.json())
    expect(row).toMatchObject({ id: "household", openOnHomeWalletId: id })
    expect(await query(otherHeaders)).toEqual([row])

    const back = await patch({ openOnHomeWalletId: null }, otherHeaders)
    expect(back.status).toBe(200)
    expect((await query())[0]?.openOnHomeWalletId).toBeNull()
  })

  test("a Wallet that is missing, archived or not in the forecast is 400 validation_failed", async () => {
    const outside = await wallet({ inForecast: false })
    const archived = await wallet()
    await server.app.request(
      `/api/finances/wallets/${archived.id}`,
      json("PATCH", { archived: true }, headers),
    )
    for (const openOnHomeWalletId of [newId(), outside.id, archived.id]) {
      const response = await patch({ openOnHomeWalletId })
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
    }
  })

  test("deleting the default Wallet puts home back on All", async () => {
    const { id } = await wallet()
    await patch({ openOnHomeWalletId: id })
    const response = await server.app.request(`/api/finances/wallets/${id}`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(200)
    expect((await query())[0]?.openOnHomeWalletId).toBeNull()
  })

  test("another row, an empty change or an unknown field is refused", async () => {
    expect((await patch({ openOnHomeWalletId: null }, headers, "elsewhere")).status).toBe(404)
    for (const body of [{}, { theme: "dark" }]) {
      const response = await patch(body)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
    }
  })
})

import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createApp } from "#server/app.ts"
import { createDb } from "#server/db/client.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer

beforeAll(async () => {
  server = await createTestServer()
})

afterAll(async () => {
  await server.close()
})

/** A gated App route: listing the household Wallets. */
function gated(headers?: Headers) {
  return server.app.request("/api/finances/wallets/query", json("POST", {}, headers))
}

test("health answers 200 when the database answers", async () => {
  const response = await server.app.request("/api/health")
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})

test("an App route without a session is 401 unauthenticated", async () => {
  const response = await gated()
  expect(response.status).toBe(401)
  expect(await response.json()).toMatchObject({ error: { code: "unauthenticated" } })
})

describe("an Account that must change its password", () => {
  test("gets 403 password_change_required from App routes", async () => {
    const { headers } = await server.signedInAccount({
      mustChangePassword: true,
      apps: ["finances"],
    })
    const response = await gated(headers)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "password_change_required" } })
  })

  test("gets 403 from Better Auth routes outside the allowlist", async () => {
    const { headers } = await server.signedInAccount({ mustChangePassword: true, role: "admin" })
    const response = await server.app.request("/api/auth/admin/list-users", { headers })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "password_change_required" } })
  })

  test("can still read its session and sign out", async () => {
    const { headers } = await server.signedInAccount({ mustChangePassword: true })
    const session = await server.app.request("/api/auth/get-session", { headers })
    expect(session.status).toBe(200)
    expect(await session.json()).toMatchObject({ user: { mustChangePassword: true } })
    const signOut = await server.app.request("/api/auth/sign-out", json("POST", {}, headers))
    expect(signOut.status).toBe(200)
  })
})

test("an Account without app_access for the App gets 403 forbidden_app", async () => {
  const { headers } = await server.signedInAccount({ apps: [] })
  const response = await gated(headers)
  expect(response.status).toBe(403)
  expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
})

test("an Account with app_access reaches the route", async () => {
  const { headers } = await server.signedInAccount({ apps: ["finances"] })
  const response = await gated(headers)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ rows: expect.any(Array) })
})

test("an Admin without app_access rows reaches every App's routes", async () => {
  const { headers } = await server.signedInAccount({ role: "admin", apps: [] })
  const response = await gated(headers)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ rows: expect.any(Array) })
})

test("an unknown API path is a 404 envelope, never the SPA", async () => {
  const response = await server.app.request("/api/nope")
  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
})

test("health answers 503 when the database does not answer", async () => {
  const { db, pool } = createDb("postgres://postgres:postgres@127.0.0.1:1/none")
  const app = createApp({ db, auth: server.auth, appVersion: "test-build" })
  const response = await app.request("/api/health")
  expect(response.status).toBe(503)
  await pool.end()
})

describe("GET /api/access", () => {
  test("lists the Apps the Account may open", async () => {
    const { headers } = await server.signedInAccount({ apps: ["finances"] })
    const response = await server.app.request("/api/access", { headers })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ apps: ["finances"] })
  })

  test("lists every App for an Admin without app_access rows", async () => {
    const { headers } = await server.signedInAccount({ role: "admin", apps: [] })
    const response = await server.app.request("/api/access", { headers })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ apps: ["finances", "notes"] })
  })

  test("is empty for a Guest without Apps", async () => {
    const { headers } = await server.signedInAccount({ apps: [] })
    expect(await (await server.app.request("/api/access", { headers })).json()).toEqual({
      apps: [],
    })
  })

  test("needs a session and a changed password", async () => {
    expect((await server.app.request("/api/access")).status).toBe(401)
    const { headers } = await server.signedInAccount({
      mustChangePassword: true,
      apps: ["finances"],
    })
    expect((await server.app.request("/api/access", { headers })).status).toBe(403)
  })
})

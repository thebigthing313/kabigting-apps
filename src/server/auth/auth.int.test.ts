import { afterAll, beforeAll, expect, test } from "vitest"
import { createApp } from "#server/app.ts"
import { createAccount } from "#server/auth/accounts.ts"
import { createAuth } from "#server/auth/auth.ts"
import { createDb } from "#server/db/client.ts"
import { createWorkerDatabase } from "#server/test/databases.ts"
import { json, TEST_BASE_URL, TEST_SECRET } from "#server/test/server.ts"

let close: () => Promise<void>
let app: ReturnType<typeof createApp>
let auth: ReturnType<typeof createAuth>
let db: ReturnType<typeof createDb>["db"]

beforeAll(async () => {
  const created = createDb(await createWorkerDatabase())
  db = created.db
  close = () => created.pool.end()
  auth = createAuth({ db, baseURL: TEST_BASE_URL, secret: TEST_SECRET })
  app = createApp({ db, auth, appVersion: "test-build" })
})

afterAll(async () => {
  await close()
})

function attempt() {
  return app.request(
    "/api/auth/sign-in/email",
    json("POST", { email: "limited@example.com", password: "wrong-password-123" }),
  )
}

test("the production config rate-limits repeated sign-in attempts", async () => {
  await createAccount({ db, auth }, { email: "limited@example.com", name: "L", apps: [] })
  const statuses = []
  for (let i = 0; i < 5; i++) statuses.push((await attempt()).status)
  expect(statuses).toContain(429)
})

test("sign-up is disabled", async () => {
  const response = await app.request(
    "/api/auth/sign-up/email",
    json("POST", { email: "new@example.com", password: "a-long-password-1", name: "N" }),
  )
  expect(response.status).toBeGreaterThanOrEqual(400)
  expect(response.status).toBeLessThan(500)
})

test("self-service password reset is disabled", async () => {
  const response = await app.request(
    "/api/auth/request-password-reset",
    json("POST", { email: "limited@example.com" }),
  )
  expect(response.ok).toBe(false)
})

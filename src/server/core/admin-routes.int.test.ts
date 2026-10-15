import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { z } from "zod"
import { auth_user } from "#server/db/schema/index.ts"
import { createTestServer, type TestServer } from "#server/test/server.ts"

let server: TestServer

beforeAll(async () => {
  server = await createTestServer()
})

afterAll(async () => {
  await server.close()
})

const ACCOUNTS = "/api/admin/accounts"

const listResponse = z.object({
  rows: z.array(z.looseObject({ id: z.string(), email: z.string() })),
})

/** The Accounts list as the given caller sees it. */
async function listAccounts(headers: Headers) {
  const response = await server.app.request(ACCOUNTS, { headers })
  expect(response.status).toBe(200)
  return listResponse.parse(await response.json()).rows
}

describe("listing Accounts", () => {
  test("the Admin sees every Account with its status and Apps, ordered by email", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const member = await server.signedInAccount({ apps: ["skeleton"] })
    const newcomer = await server.signedInAccount({ mustChangePassword: true })
    const removed = await server.signedInAccount()
    await server.db.update(auth_user).set({ banned: true }).where(eq(auth_user.id, removed.user.id))

    const rows = await listAccounts(admin.headers)

    const emails = rows.map((row) => row.email)
    expect(emails).toEqual(emails.toSorted())
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: admin.user.id,
          email: admin.user.email,
          role: "admin",
          status: "active",
        }),
        expect.objectContaining({
          id: member.user.id,
          name: member.user.name,
          role: "user",
          status: "active",
          apps: ["skeleton"],
        }),
        expect.objectContaining({ id: newcomer.user.id, status: "awaiting_password_change" }),
        expect.objectContaining({ id: removed.user.id, status: "removed", apps: [] }),
      ]),
    )
  })

  test("a non-Admin gets 403 forbidden_admin", async () => {
    const { headers } = await server.signedInAccount({ apps: ["skeleton"] })
    const response = await server.app.request(ACCOUNTS, { headers })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "forbidden_admin" } })
  })

  test("a signed-out caller gets 401", async () => {
    const response = await server.app.request(ACCOUNTS)
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: { code: "unauthenticated" } })
  })

  test("an Admin who must change their password gets 403 password_change_required", async () => {
    const { headers } = await server.signedInAccount({ role: "admin", mustChangePassword: true })
    const response = await server.app.request(ACCOUNTS, { headers })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "password_change_required" } })
  })
})

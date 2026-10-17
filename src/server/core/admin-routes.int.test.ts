import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { z } from "zod"
import { auth_user } from "#server/db/schema/index.ts"
import { changePassword, session, signIn } from "#server/test/http-auth.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

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

const rowResponse = z.object({
  row: z.looseObject({
    id: z.string(),
    email: z.string(),
    status: z.string(),
    temporaryPassword: z.string().nullable(),
  }),
})

let counter = 0

function uniqueEmail() {
  counter += 1
  return `created${counter}@example.com`
}

/** The Admin creates an Account through the API and gets its row back. */
async function createViaApi(adminHeaders: Headers, body: unknown) {
  return server.app.request(ACCOUNTS, json("POST", body, adminHeaders))
}

/** The Accounts list as the given caller sees it. */
async function listAccounts(headers: Headers) {
  const response = await server.app.request(ACCOUNTS, { headers })
  expect(response.status).toBe(200)
  return listResponse.parse(await response.json()).rows
}

describe("listing Accounts", () => {
  test("the Admin sees every Account with its status and Apps, ordered by email", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const member = await server.signedInAccount({ apps: ["finances"] })
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
          apps: ["finances"],
        }),
        expect.objectContaining({ id: newcomer.user.id, status: "awaiting_password_change" }),
        expect.objectContaining({ id: removed.user.id, status: "removed", apps: [] }),
      ]),
    )
  })

  test("a non-Admin gets 403 forbidden_admin", async () => {
    const { headers } = await server.signedInAccount({ apps: ["finances"] })
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

describe("creating an Account", () => {
  test("returns the row with a temporary password the Account signs in with", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const email = uniqueEmail()

    const response = await createViaApi(admin.headers, {
      email: `  ${email.toUpperCase()} `,
      name: "  New Person ",
      apps: ["finances"],
    })
    expect(response.status).toBe(201)
    const { row } = rowResponse.parse(await response.json())
    expect(row).toMatchObject({
      email,
      name: "New Person",
      role: "user",
      status: "awaiting_password_change",
      apps: ["finances"],
    })
    if (!row.temporaryPassword) throw new Error("No temporary password returned")

    const signedIn = await signIn(server.app, email, row.temporaryPassword)
    expect(signedIn.status).toBe(200)
    expect(await session(server.app, signedIn.headers)).toMatchObject({
      user: { mustChangePassword: true, role: "user" },
    })
  })

  test("the password stays on the row until the Account changes it", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const email = uniqueEmail()
    const { row } = rowResponse.parse(
      await (await createViaApi(admin.headers, { email, name: "Later", apps: [] })).json(),
    )
    const password = row.temporaryPassword ?? ""

    const listed = (await listAccounts(admin.headers)).find((r) => r.id === row.id)
    expect(listed).toMatchObject({ temporaryPassword: password })

    const signedIn = await signIn(server.app, email, password)
    const changed = await changePassword(
      server.app,
      signedIn.headers,
      password,
      "a-password-of-my-own",
    )
    expect(changed.status).toBe(200)

    const after = (await listAccounts(admin.headers)).find((r) => r.id === row.id)
    expect(after).toMatchObject({ status: "active", temporaryPassword: null })
  })

  test("a settled Account has no temporary password on its row", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const member = await server.signedInAccount()
    const listed = (await listAccounts(admin.headers)).find((r) => r.id === member.user.id)
    expect(listed).toMatchObject({ temporaryPassword: null })
  })

  test("an email that already has an Account is a 409 conflict", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const existing = await server.signedInAccount()
    const response = await createViaApi(admin.headers, {
      email: existing.user.email.toUpperCase(),
      name: "Twin",
      apps: [],
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
  })

  test.each([
    ["an unknown App", { email: "x@example.com", name: "X", apps: ["nope"] }],
    ["a bad email", { email: "not-an-email", name: "X", apps: [] }],
    ["a blank name", { email: "x@example.com", name: "   ", apps: [] }],
    ["a name over 100 characters", { email: "x@example.com", name: "n".repeat(101), apps: [] }],
    ["an unexpected field", { email: "x@example.com", name: "X", apps: [], role: "admin" }],
  ])("%s is a 400", async (_, body) => {
    const admin = await server.signedInAccount({ role: "admin" })
    const response = await createViaApi(admin.headers, body)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
  })

  test("a non-Admin cannot create an Account", async () => {
    const { headers } = await server.signedInAccount()
    const response = await createViaApi(headers, { email: uniqueEmail(), name: "X", apps: [] })
    expect(response.status).toBe(403)
  })
})

/** Runs an action on one Account as the given caller. */
function act(headers: Headers, userId: string, action: string) {
  return server.app.request(`${ACCOUNTS}/${userId}/${action}`, json("POST", {}, headers))
}

describe("resetting a password", () => {
  test("issues a new temporary password, forces a change and signs the Account out", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const email = uniqueEmail()
    const created = rowResponse.parse(
      await (await createViaApi(admin.headers, { email, name: "Forgetful", apps: [] })).json(),
    ).row
    const oldPassword = created.temporaryPassword ?? ""
    const signedIn = await signIn(server.app, email, oldPassword)
    const settled = await changePassword(
      server.app,
      signedIn.headers,
      oldPassword,
      "a-password-i-forgot",
    )

    const response = await act(admin.headers, created.id, "reset")
    expect(response.status).toBe(200)
    const { row } = rowResponse.parse(await response.json())
    expect(row).toMatchObject({ status: "awaiting_password_change" })
    const newPassword = row.temporaryPassword ?? ""
    expect(newPassword).not.toBe("")
    expect(newPassword).not.toBe(oldPassword)

    expect(await session(server.app, settled.headers)).toBeNull()
    expect((await signIn(server.app, email, "a-password-i-forgot")).status).toBe(401)
    const again = await signIn(server.app, email, newPassword)
    expect(again.status).toBe(200)
    expect(await session(server.app, again.headers)).toMatchObject({
      user: { mustChangePassword: true },
    })
    const listed = (await listAccounts(admin.headers)).find((r) => r.id === created.id)
    expect(listed).toMatchObject({ temporaryPassword: newPassword })
  })

  test("the Admin cannot reset their own Account here", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const response = await act(admin.headers, admin.user.id, "reset")
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { code: "conflict", message: "You cannot change your own Account here" },
    })
    expect(await session(server.app, admin.headers)).not.toBeNull()
  })

  test("an unknown Account is a 404", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const response = await act(admin.headers, "no-such-account", "reset")
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
  })

  test("a non-Admin cannot reset anyone", async () => {
    const caller = await server.signedInAccount()
    const target = await server.signedInAccount()
    expect((await act(caller.headers, target.user.id, "reset")).status).toBe(403)
    expect(await session(server.app, target.headers)).not.toBeNull()
  })
})

describe("removing and restoring an Account", () => {
  test("removal blocks sign-in and signs out everywhere; restoring lets the old password back in", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const email = uniqueEmail()
    const created = rowResponse.parse(
      await (await createViaApi(admin.headers, { email, name: "Leaving", apps: [] })).json(),
    ).row
    const temporary = created.temporaryPassword ?? ""
    const signedIn = await signIn(server.app, email, temporary)
    const settled = await changePassword(server.app, signedIn.headers, temporary, "my-own-password")

    const removed = await act(admin.headers, created.id, "remove")
    expect(removed.status).toBe(200)
    expect(rowResponse.parse(await removed.json()).row).toMatchObject({ status: "removed" })
    expect(await session(server.app, settled.headers)).toBeNull()
    expect((await signIn(server.app, email, "my-own-password")).status).not.toBe(200)

    const again = await act(admin.headers, created.id, "remove")
    expect(again.status).toBe(200)
    expect(rowResponse.parse(await again.json()).row).toMatchObject({ status: "removed" })

    const restored = await act(admin.headers, created.id, "restore")
    expect(restored.status).toBe(200)
    expect(rowResponse.parse(await restored.json()).row).toMatchObject({ status: "active" })
    expect((await signIn(server.app, email, "my-own-password")).status).toBe(200)
  })

  test("removal clears a temporary password; after a restore the Admin must reset", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const email = uniqueEmail()
    const created = rowResponse.parse(
      await (await createViaApi(admin.headers, { email, name: "Never came", apps: [] })).json(),
    ).row

    const removed = rowResponse.parse(await (await act(admin.headers, created.id, "remove")).json())
    expect(removed.row).toMatchObject({ status: "removed", temporaryPassword: null })

    const restored = rowResponse.parse(
      await (await act(admin.headers, created.id, "restore")).json(),
    )
    expect(restored.row).toMatchObject({
      status: "awaiting_password_change",
      temporaryPassword: null,
    })
  })

  test("restoring an Active Account changes nothing", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const member = await server.signedInAccount()
    const response = await act(admin.headers, member.user.id, "restore")
    expect(response.status).toBe(200)
    expect(rowResponse.parse(await response.json()).row).toMatchObject({ status: "active" })
    expect(await session(server.app, member.headers)).not.toBeNull()
  })

  test.each(["remove", "restore"])(
    "%s refuses the Admin's own Account and unknown ones",
    async (action) => {
      const admin = await server.signedInAccount({ role: "admin" })
      expect((await act(admin.headers, admin.user.id, action)).status).toBe(409)
      expect((await act(admin.headers, "no-such-account", action)).status).toBe(404)
      expect(await session(server.app, admin.headers)).not.toBeNull()
    },
  )

  test("a non-Admin cannot remove anyone", async () => {
    const caller = await server.signedInAccount()
    const target = await server.signedInAccount()
    expect((await act(caller.headers, target.user.id, "remove")).status).toBe(403)
    expect(await session(server.app, target.headers)).not.toBeNull()
  })
})

function setApps(headers: Headers, userId: string, body: unknown) {
  return server.app.request(`${ACCOUNTS}/${userId}/apps`, json("PUT", body, headers))
}

function finances(headers: Headers) {
  return server.app.request("/api/finances/wallets/query", json("POST", {}, headers))
}

describe("editing App access", () => {
  test("grants and revokes Apps; a revoked App refuses the Account at once", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const guest = await server.signedInAccount()
    expect((await finances(guest.headers)).status).toBe(403)

    const granted = await setApps(admin.headers, guest.user.id, { apps: ["finances"] })
    expect(granted.status).toBe(200)
    expect(rowResponse.parse(await granted.json()).row).toMatchObject({ apps: ["finances"] })
    expect((await finances(guest.headers)).status).toBe(200)

    const revoked = await setApps(admin.headers, guest.user.id, { apps: [] })
    expect(revoked.status).toBe(200)
    expect(rowResponse.parse(await revoked.json()).row).toMatchObject({ apps: [] })
    const refused = await finances(guest.headers)
    expect(refused.status).toBe(403)
    expect(await refused.json()).toMatchObject({ error: { code: "forbidden_app" } })
    // Revoking an App does not sign the Account out.
    expect(await session(server.app, guest.headers)).not.toBeNull()
  })

  test("saving the same set twice changes nothing", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const member = await server.signedInAccount({ apps: ["finances"] })
    const response = await setApps(admin.headers, member.user.id, {
      apps: ["finances", "finances"],
    })
    expect(response.status).toBe(200)
    expect(rowResponse.parse(await response.json()).row).toMatchObject({ apps: ["finances"] })
  })

  test("refusals: unknown App, the Admin's own Account, an unknown Account, a non-Admin", async () => {
    const admin = await server.signedInAccount({ role: "admin" })
    const member = await server.signedInAccount({ apps: ["finances"] })
    expect((await setApps(admin.headers, member.user.id, { apps: ["nope"] })).status).toBe(400)
    expect((await setApps(admin.headers, member.user.id, {})).status).toBe(400)
    expect((await setApps(admin.headers, admin.user.id, { apps: [] })).status).toBe(409)
    expect((await setApps(admin.headers, "no-such-account", { apps: [] })).status).toBe(404)
    expect((await setApps(member.headers, admin.user.id, { apps: [] })).status).toBe(403)
    expect((await finances(member.headers)).status).toBe(200)
  })
})

describe("guards on every route", () => {
  test.each([
    ["GET", ""],
    ["POST", ""],
    ["POST", "/target/reset"],
    ["POST", "/target/remove"],
    ["POST", "/target/restore"],
    ["PUT", "/target/apps"],
  ])("%s accounts%s answers a non-Admin with 403 forbidden_admin", async (method, path) => {
    const caller = await server.signedInAccount()
    const target = await server.signedInAccount()
    const url = `${ACCOUNTS}${path.replace("target", target.user.id)}`
    const init =
      method === "GET" ? { headers: caller.headers } : json(method, { apps: [] }, caller.headers)
    const response = await server.app.request(url, init)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "forbidden_admin" } })
  })
})

test("an Account whose password was set without the change flow never shows a stored one", async () => {
  // As the e2e seed and the CLI can leave it: a stored temporary password on an Active Account.
  const admin = await server.signedInAccount({ role: "admin" })
  const email = uniqueEmail()
  const created = rowResponse.parse(
    await (await createViaApi(admin.headers, { email, name: "Seeded", apps: [] })).json(),
  ).row
  await server.db
    .update(auth_user)
    .set({ mustChangePassword: false })
    .where(eq(auth_user.id, created.id))

  const listed = (await listAccounts(admin.headers)).find((r) => r.id === created.id)
  expect(listed).toMatchObject({ status: "active", temporaryPassword: null })
})

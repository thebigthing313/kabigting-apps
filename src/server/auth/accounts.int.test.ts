import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { z } from "zod"
import { banAccount, createAccount, resetAccount } from "#server/auth/accounts.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let counter = 0

beforeAll(async () => {
  server = await createTestServer()
})

afterAll(async () => {
  await server.close()
})

function uniqueEmail() {
  counter += 1
  return `person${counter}@example.com`
}

/** Signs in over HTTP, as the browser does, and returns the session cookie as request headers. */
async function signIn(email: string, password: string) {
  const response = await server.app.request(
    "/api/auth/sign-in/email",
    json("POST", { email, password }),
  )
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
  return { status: response.status, headers: new Headers(cookie ? { cookie } : {}) }
}

const sessionBody = z
  .object({ user: z.object({ mustChangePassword: z.boolean(), role: z.string() }) })
  .nullable()

async function session(headers: Headers) {
  const response = await server.app.request("/api/auth/get-session", { headers })
  return sessionBody.parse(await response.json())
}

async function changePassword(headers: Headers, currentPassword: string, newPassword: string) {
  const response = await server.app.request(
    "/api/auth/change-password",
    json("POST", { currentPassword, newPassword }, headers),
  )
  return { status: response.status, headers: mergeCookies(headers, response) }
}

function mergeCookies(headers: Headers, response: Response) {
  const set = response.headers.getSetCookie().map((c) => c.split(";")[0])
  return set.length > 0 ? new Headers({ cookie: set.join("; ") }) : headers
}

async function notes(headers: Headers) {
  return server.app.request("/api/skeleton/notes/query", json("POST", {}, headers))
}

describe("createAccount", () => {
  test("makes an Account that signs in with a one-time temporary password", async () => {
    const email = uniqueEmail()
    const { temporaryPassword } = await createAccount(server, {
      email,
      name: "New",
      apps: ["skeleton"],
    })
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(16)

    const { status, headers } = await signIn(email, temporaryPassword)
    expect(status).toBe(200)
    expect(await session(headers)).toMatchObject({
      user: { mustChangePassword: true, role: "user" },
    })
    expect((await notes(headers)).status).toBe(403)
  })

  test("temporary passwords differ every time", async () => {
    const a = await createAccount(server, { email: uniqueEmail(), name: "A", apps: [] })
    const b = await createAccount(server, { email: uniqueEmail(), name: "B", apps: [] })
    expect(a.temporaryPassword).not.toBe(b.temporaryPassword)
  })

  test("can create an Admin", async () => {
    const email = uniqueEmail()
    const { temporaryPassword } = await createAccount(server, {
      email,
      name: "Admin",
      apps: [],
      role: "admin",
    })
    const { headers } = await signIn(email, temporaryPassword)
    expect(await session(headers)).toMatchObject({
      user: { role: "admin", mustChangePassword: true },
    })
  })
})

describe("changing the temporary password", () => {
  test("clears the flag, opens the Apps and revokes the Account's other sessions", async () => {
    const email = uniqueEmail()
    const { temporaryPassword } = await createAccount(server, {
      email,
      name: "C",
      apps: ["skeleton"],
    })
    const phone = await signIn(email, temporaryPassword)
    const laptop = await signIn(email, temporaryPassword)

    const changed = await changePassword(laptop.headers, temporaryPassword, "a-brand-new-password")
    expect(changed.status).toBe(200)
    expect(await session(changed.headers)).toMatchObject({ user: { mustChangePassword: false } })
    expect((await notes(changed.headers)).status).toBe(200)
    expect(await session(phone.headers)).toBeNull()
  })

  test("rejects reusing the temporary password", async () => {
    const email = uniqueEmail()
    const { temporaryPassword } = await createAccount(server, { email, name: "D", apps: [] })
    const { headers } = await signIn(email, temporaryPassword)
    const changed = await changePassword(headers, temporaryPassword, temporaryPassword)
    expect(changed.status).toBe(400)
    expect(await session(headers)).toMatchObject({ user: { mustChangePassword: true } })
  })

  test("rejects a new password shorter than 12 characters", async () => {
    const email = uniqueEmail()
    const { temporaryPassword } = await createAccount(server, { email, name: "E", apps: [] })
    const { headers } = await signIn(email, temporaryPassword)
    expect((await changePassword(headers, temporaryPassword, "short-pass1")).status).toBe(400)
  })

  test("an Account cannot clear its own flag through update-user", async () => {
    const email = uniqueEmail()
    const { temporaryPassword } = await createAccount(server, { email, name: "F", apps: [] })
    const { headers } = await signIn(email, temporaryPassword)
    const response = await server.app.request(
      "/api/auth/update-user",
      json("POST", { mustChangePassword: false }, headers),
    )
    expect(response.status).toBe(403)
    expect(await session(headers)).toMatchObject({ user: { mustChangePassword: true } })
  })

  test("an Account that changed its password cannot set the flag field through update-user", async () => {
    const email = uniqueEmail()
    const { temporaryPassword } = await createAccount(server, { email, name: "G", apps: [] })
    const signedIn = await signIn(email, temporaryPassword)
    const { headers } = await changePassword(
      signedIn.headers,
      temporaryPassword,
      "another-good-password",
    )
    const response = await server.app.request(
      "/api/auth/update-user",
      json("POST", { mustChangePassword: true }, headers),
    )
    expect(response.status).toBe(400)
    expect(await session(headers)).toMatchObject({ user: { mustChangePassword: false } })
  })
})

describe("resetAccount", () => {
  test("issues a new temporary password, sets the flag again and signs the Account out everywhere", async () => {
    const email = uniqueEmail()
    const first = await createAccount(server, { email, name: "H", apps: ["skeleton"] })
    const signedIn = await signIn(email, first.temporaryPassword)
    const { headers } = await changePassword(
      signedIn.headers,
      first.temporaryPassword,
      "my-own-password-1",
    )

    const { temporaryPassword } = await resetAccount(server, { email })
    expect(await session(headers)).toBeNull()
    expect((await signIn(email, "my-own-password-1")).status).toBe(401)
    const again = await signIn(email, temporaryPassword)
    expect(again.status).toBe(200)
    expect(await session(again.headers)).toMatchObject({ user: { mustChangePassword: true } })
  })
})

describe("banAccount", () => {
  test("blocks sign-in and revokes existing sessions", async () => {
    const email = uniqueEmail()
    const { temporaryPassword } = await createAccount(server, { email, name: "I", apps: [] })
    const { headers } = await signIn(email, temporaryPassword)
    await banAccount(server, { email })
    expect(await session(headers)).toBeNull()
    expect((await signIn(email, temporaryPassword)).status).not.toBe(200)
  })
})

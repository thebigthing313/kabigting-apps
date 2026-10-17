import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import { runAdmin } from "./admin.ts"

let server: TestServer

beforeAll(async () => {
  server = await createTestServer()
})

afterAll(async () => {
  await server.close()
})

async function run(...args: string[]) {
  const lines: string[] = []
  await runAdmin(args, server, (line) => lines.push(line))
  return lines.join("\n")
}

function passwordIn(output: string): string {
  const match = /Temporary password: (\S+)/.exec(output)
  if (!match?.[1]) throw new Error(`No password in: ${output}`)
  return match[1]
}

async function signIn(email: string, password: string) {
  return server.app.request("/api/auth/sign-in/email", json("POST", { email, password }))
}

describe("admin create", () => {
  test("creates an Admin with every App and prints the temporary password once", async () => {
    const output = await run("create", "--email", "owner@example.com", "--name", "Owner")
    const response = await signIn("owner@example.com", passwordIn(output))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      user: { role: "admin", mustChangePassword: true },
    })
  })
})

describe("admin create-account", () => {
  test("creates an Account with the named Apps", async () => {
    const output = await run(
      "create-account",
      "--email",
      "guest@example.com",
      "--name",
      "Guest",
      "--apps",
      "finances",
    )
    expect(output).toContain("finances")
    expect((await signIn("guest@example.com", passwordIn(output))).status).toBe(200)
  })

  test("refuses an unknown App", async () => {
    await expect(
      run("create-account", "--email", "x@example.com", "--name", "X", "--apps", "nope"),
    ).rejects.toThrow(/Unknown App/)
  })
})

describe("admin reset and ban", () => {
  test("reset prints a new temporary password that works", async () => {
    await run("create-account", "--email", "forgot@example.com", "--name", "F", "--apps", "")
    const output = await run("reset", "--email", "forgot@example.com")
    expect((await signIn("forgot@example.com", passwordIn(output))).status).toBe(200)
  })

  test("ban stops sign-in", async () => {
    const output = await run(
      "create-account",
      "--email",
      "gone@example.com",
      "--name",
      "G",
      "--apps",
      "",
    )
    await run("ban", "--email", "gone@example.com")
    expect((await signIn("gone@example.com", passwordIn(output))).status).not.toBe(200)
  })
})

test("an unknown command shows usage", async () => {
  await expect(run("explode")).rejects.toThrow(/Usage/)
})

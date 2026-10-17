import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestServer, type TestServer } from "#server/test/server.ts"

let server: TestServer
let root: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "kabigting-static-"))
  await mkdir(join(root, "assets"))
  await writeFile(join(root, "index.html"), "<!doctype html><title>shell</title>")
  await writeFile(join(root, "assets", "main-abc123.js"), "console.log(1)")
  await writeFile(join(root, "sw.js"), "self.addEventListener('install', () => {})")
  await writeFile(join(root, "manifest.webmanifest"), "{}")
  server = await createTestServer({ staticRoot: root })
})

afterAll(async () => {
  await server.close()
  await rm(root, { recursive: true, force: true })
})

describe("API responses", () => {
  test("are never cached and carry the build id", async () => {
    const response = await server.app.request("/api/health")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("x-app-version")).toBe("test-build")
  })

  test("errors are not cached either", async () => {
    const response = await server.app.request("/api/nope")
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
})

describe("the built SPA", () => {
  test.each(["/", "/finances", "/sign-in?next=%2F"])(
    "%s serves index.html with no-cache",
    async (path) => {
      const response = await server.app.request(path)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain("<title>shell</title>")
      expect(response.headers.get("cache-control")).toBe("no-cache")
      expect(response.headers.get("x-app-version")).toBe("test-build")
    },
  )

  test.each(["/sw.js", "/manifest.webmanifest"])(
    "%s is revalidated on every load",
    async (path) => {
      const response = await server.app.request(path)
      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toBe("no-cache")
    },
  )

  test("hashed assets are cached forever", async () => {
    const response = await server.app.request("/assets/main-abc123.js")
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
  })

  test("a missing asset is a 404, not the SPA", async () => {
    const response = await server.app.request("/assets/gone-000.js")
    expect(response.status).toBe(404)
  })
})

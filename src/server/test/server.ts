// An in-process app on this worker's own migrated database, with Better Auth's test helpers.
import { eq } from "drizzle-orm"
import { createApp } from "#server/app.ts"
import { createTestAuth } from "#server/auth/auth.ts"
import { createDb } from "#server/db/client.ts"
import { appAccess, auth_user } from "#server/db/schema/index.ts"
import { createWorkerDatabase } from "#server/test/databases.ts"

export const TEST_SECRET = "test-only-secret-that-is-long-enough-0123456789"
export const TEST_BASE_URL = "http://localhost:3000"

type TestAccount = { mustChangePassword?: boolean; apps?: string[]; role?: "admin" | "user" }

export async function createTestServer(options: { staticRoot?: string } = {}) {
  const databaseUrl = await createWorkerDatabase()
  const { db, pool } = createDb(databaseUrl)
  const auth = createTestAuth({ db, baseURL: TEST_BASE_URL, secret: TEST_SECRET })
  const app = createApp({ db, auth, appVersion: "test-build", staticRoot: options.staticRoot })
  const { test } = await auth.$context

  let counter = 0

  /** Saves an Account directly and returns request headers carrying its session cookie. */
  async function signedInAccount({
    mustChangePassword = false,
    apps = [],
    role = "user",
  }: TestAccount = {}) {
    counter += 1
    const user = await test.saveUser(
      test.createUser({ email: `account${counter}@example.com`, name: `Account ${counter}`, role }),
    )
    await db.update(auth_user).set({ mustChangePassword }).where(eq(auth_user.id, user.id))
    for (const appKey of apps) await db.insert(appAccess).values({ userId: user.id, appKey })
    const headers = await test.getAuthHeaders({ userId: user.id })
    return { user, headers }
  }

  return { app, db, auth, databaseUrl, signedInAccount, close: () => pool.end() }
}

export type TestServer = Awaited<ReturnType<typeof createTestServer>>

/** JSON request helper for `app.request`. */
export function json(method: string, body: unknown, headers?: Headers): RequestInit {
  const merged = new Headers(headers)
  merged.set("content-type", "application/json")
  return { method, headers: merged, body: JSON.stringify(body) }
}

// Better Auth over HTTP, as the browser uses it: sign in, read the session, change the password.
import { z } from "zod"
import { json } from "#server/test/server.ts"

type App = { request: (path: string, init?: RequestInit) => Response | Promise<Response> }

function cookiesOf(response: Response): string[] {
  return response.headers.getSetCookie().map((c) => c.split(";")[0] ?? "")
}

/** Signs in and returns the session cookie as request headers. */
export async function signIn(app: App, email: string, password: string) {
  const response = await app.request("/api/auth/sign-in/email", json("POST", { email, password }))
  const cookie = cookiesOf(response).join("; ")
  return { status: response.status, headers: new Headers(cookie ? { cookie } : {}) }
}

const sessionBody = z
  .object({ user: z.object({ mustChangePassword: z.boolean(), role: z.string() }) })
  .nullable()

export async function session(app: App, headers: Headers) {
  const response = await app.request("/api/auth/get-session", { headers })
  return sessionBody.parse(await response.json())
}

/** Changes the password; the returned headers carry the new session cookie when one is set. */
export async function changePassword(
  app: App,
  headers: Headers,
  currentPassword: string,
  newPassword: string,
) {
  const response = await app.request(
    "/api/auth/change-password",
    json("POST", { currentPassword, newPassword }, headers),
  )
  const set = cookiesOf(response)
  return {
    status: response.status,
    headers: set.length > 0 ? new Headers({ cookie: set.join("; ") }) : headers,
  }
}

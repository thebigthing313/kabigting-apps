import { createMiddleware } from "hono/factory"
import type { AppEnv, AuthServer, Session } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"

/** Loads the session once per request (null when signed out). */
export function loadSession(auth: AuthServer) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get("session") === undefined) {
      c.set("session", await auth.api.getSession({ headers: c.req.raw.headers }))
    }
    await next()
  })
}

/** 401 without a session; otherwise puts the typed Account on the context. */
export function requireSession(auth: AuthServer) {
  const load = loadSession(auth)
  return createMiddleware<AppEnv>(async (c, next) => {
    await load(c, async () => {})
    const session: Session | null | undefined = c.get("session")
    if (!session) throw new ApiError("unauthenticated", "Sign in to continue")
    const { id, email, name, role } = session.user
    c.set("account", { id, email, name, role: role ?? "user" })
    await next()
  })
}

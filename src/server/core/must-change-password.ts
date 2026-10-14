import { createMiddleware } from "hono/factory"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"

/** The only requests an Account may make before replacing its temporary password. */
const ALLOWED = [
  { method: "GET", path: "/api/auth/get-session" },
  { method: "POST", path: "/api/auth/change-password" },
  { method: "POST", path: "/api/auth/sign-out" },
]

/** 403 `password_change_required` while the session's Account still has a temporary password. */
export const mustChangePassword = createMiddleware<AppEnv>(async (c, next) => {
  const session = c.get("session")
  if (session?.user.mustChangePassword) {
    const allowed = ALLOWED.some((a) => a.method === c.req.method && a.path === c.req.path)
    if (!allowed)
      throw new ApiError("password_change_required", "Change your temporary password first")
  }
  await next()
})

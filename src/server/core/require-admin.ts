import { createMiddleware } from "hono/factory"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"

/** 403 `forbidden_admin` unless the signed-in Account has the `admin` role. Runs after `requireSession`. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("account").role !== "admin") {
    throw new ApiError("forbidden_admin", "Only the Admin can do this")
  }
  await next()
})

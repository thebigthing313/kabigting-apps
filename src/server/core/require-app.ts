import { and, eq } from "drizzle-orm"
import { createMiddleware } from "hono/factory"
import { holdsAppAccess } from "#server/core/app-access.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import type { Db } from "#server/db/client.ts"
import { auth_user } from "#server/db/schema/index.ts"

/**
 * Default deny: 403 `forbidden_app` unless the Account holds the App (`holdsAppAccess`). The
 * Admin holds every App through the role and needs no row.
 */
export function requireApp(appKey: string, db: Db) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const account = c.get("account")
    if (account.role === "admin") return next()
    const [row] = await db
      .select({ id: auth_user.id })
      .from(auth_user)
      .where(and(eq(auth_user.id, account.id), holdsAppAccess(appKey)))
      .limit(1)
    if (!row) throw new ApiError("forbidden_app", "You do not have access to this App")
    await next()
  })
}

import { and, eq } from "drizzle-orm"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import type { Db } from "#server/db/client.ts"
import { appAccess } from "#server/db/schema/index.ts"

/** Default deny: 403 `forbidden_app` unless the Account has an `app_access` row for the App. */
export function requireApp(appKey: string, db: Db) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const [row] = await db
      .select({ appKey: appAccess.appKey })
      .from(appAccess)
      .where(and(eq(appAccess.userId, c.get("account").id), eq(appAccess.appKey, appKey)))
      .limit(1)
    if (!row) throw new ApiError("forbidden_app", "You do not have access to this App")
    await next()
  })
}

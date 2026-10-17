import { eq } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv, Deps } from "#server/core/context.ts"
import { mustChangePassword } from "#server/core/must-change-password.ts"
import { requireSession } from "#server/core/session.ts"
import { appAccess } from "#server/db/schema/index.ts"
import { APP_KEYS } from "#shared/apps.ts"

/**
 * Which Apps the signed-in Account may open; the Shell builds its App switcher from this. The
 * Admin holds every App through the role, everyone else through their `app_access` rows.
 */
export function accessRoutes({ db, auth }: Deps) {
  return new Hono<AppEnv>()
    .use(requireSession(auth))
    .use(mustChangePassword)
    .get("/", async (c) => {
      const account = c.get("account")
      if (account.role === "admin") return c.json({ apps: [...APP_KEYS] })
      const rows = await db
        .select({ appKey: appAccess.appKey })
        .from(appAccess)
        .where(eq(appAccess.userId, account.id))
        .orderBy(appAccess.appKey)
      return c.json({ apps: rows.map((r) => r.appKey) })
    })
}

import { eq } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnv, Deps } from "#server/core/context.ts"
import { mustChangePassword } from "#server/core/must-change-password.ts"
import { requireSession } from "#server/core/session.ts"
import { appAccess } from "#server/db/schema/index.ts"

/** Which Apps the signed-in Account may open; the Shell builds its App switcher from this. */
export function accessRoutes({ db, auth }: Deps) {
  return new Hono<AppEnv>()
    .use(requireSession(auth))
    .use(mustChangePassword)
    .get("/", async (c) => {
      const rows = await db
        .select({ appKey: appAccess.appKey })
        .from(appAccess)
        .where(eq(appAccess.userId, c.get("account").id))
        .orderBy(appAccess.appKey)
      return c.json({ apps: rows.map((r) => r.appKey) })
    })
}

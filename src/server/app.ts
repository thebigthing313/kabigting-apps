import { sql } from "drizzle-orm"
import { Hono } from "hono"
import { financesRoutes } from "#server/apps/finances/routes.ts"
import { notesRoutes } from "#server/apps/notes/routes.ts"
import { accessRoutes } from "#server/core/access-routes.ts"
import { adminRoutes } from "#server/core/admin-routes.ts"
import { appVersionHeader, noStore } from "#server/core/cache-headers.ts"
import type { AppEnv, AuthServer, Deps } from "#server/core/context.ts"
import { errorResponse, handleError } from "#server/core/errors.ts"
import { mustChangePassword } from "#server/core/must-change-password.ts"
import { loadSession } from "#server/core/session.ts"
import type { Db } from "#server/db/client.ts"
import { serveSpa } from "#server/static.ts"

/** Every App's router under `/api`. Its type is what the client's `api.ts` imports. */
function apiRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .basePath("/api")
    .route("/access", accessRoutes(deps))
    .route("/admin", adminRoutes(deps))
    .route("/finances", financesRoutes(deps))
    .route("/notes", notesRoutes(deps))
}

export type AppType = ReturnType<typeof apiRoutes>

export type AppOptions = {
  db: Db
  auth: AuthServer
  /** Build ID sent as `X-App-Version` so clients can spot a newer deploy. */
  appVersion: string
  /** Directory of the built SPA; omitted in development, where Vite serves it. */
  staticRoot?: string
}

export function createApp({ db, auth, appVersion, staticRoot }: AppOptions) {
  const app = new Hono<AppEnv>()
  app.onError(handleError)
  app.use("*", appVersionHeader(appVersion))
  app.use("/api/*", noStore)

  app.get("/api/health", async (c) => {
    try {
      await db.execute(sql`select 1`)
      return c.json({ ok: true })
    } catch {
      return c.json({ ok: false }, 503)
    }
  })

  app.use("/api/*", loadSession(auth))
  app.use("/api/*", mustChangePassword)
  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
  app.route("/", apiRoutes({ db, auth }))
  app.all("/api/*", (c) => errorResponse(c, "not_found", "No such API route"))

  if (staticRoot) serveSpa(app, staticRoot)

  return app
}

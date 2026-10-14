import { Hono } from "hono"
import { bodyLimit } from "#server/core/body-limit.ts"
import type { AppEnv, Deps } from "#server/core/context.ts"
import { mustChangePassword } from "#server/core/must-change-password.ts"
import { requireApp } from "#server/core/require-app.ts"
import { requireSession } from "#server/core/session.ts"

/**
 * The only way to create an App router. Every route behind it runs, in order: body limit,
 * session required, must-change-password guard, App access check; then its own validator.
 */
export function createAppRouter(appKey: string, { db, auth }: Deps) {
  return new Hono<AppEnv>()
    .use(bodyLimit)
    .use(requireSession(auth))
    .use(mustChangePassword)
    .use(requireApp(appKey, db))
}

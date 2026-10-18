import { Hono } from "hono"
import { bodyLimitWithUploads } from "#server/core/body-limit.ts"
import type { AppEnv, Deps } from "#server/core/context.ts"
import { mustChangePassword } from "#server/core/must-change-password.ts"
import { requireApp } from "#server/core/require-app.ts"
import { requireSession } from "#server/core/session.ts"

type AppRouterOptions = {
  /** Routes, under the App's own path (such as "/uploads"), that take a file upload's larger body. */
  uploadRoutes?: readonly string[]
}

/**
 * The only way to create an App router. Every route behind it runs, in order: body limit,
 * session required, must-change-password guard, App access check; then its own validator.
 */
export function createAppRouter(
  appKey: string,
  { db, auth }: Deps,
  { uploadRoutes = [] }: AppRouterOptions = {},
) {
  // Every App is mounted at /api/<key>.
  const uploadPaths = new Set(uploadRoutes.map((route) => `/api/${appKey}${route}`))
  return new Hono<AppEnv>()
    .use(bodyLimitWithUploads(uploadPaths))
    .use(requireSession(auth))
    .use(mustChangePassword)
    .use(requireApp(appKey, db))
}

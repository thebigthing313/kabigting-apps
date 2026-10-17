import type { Deps } from "#server/core/context.ts"
import { createAppRouter } from "#server/core/create-app-router.ts"

/** The Finances App's API. It has no resources yet; `/ping` lets tests make a gated request. */
export function financesRoutes(deps: Deps) {
  return createAppRouter("finances", deps).get("/ping", (c) => c.json({ ok: true }))
}

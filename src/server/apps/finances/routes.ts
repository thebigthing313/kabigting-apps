import { accountRoutes } from "#server/apps/finances/accounts.ts"
import { categoryRoutes } from "#server/apps/finances/categories.ts"
import type { Deps } from "#server/core/context.ts"
import { createAppRouter } from "#server/core/create-app-router.ts"

/**
 * The Finances App's API. Every resource is shared household data behind the App's access check.
 * `/ping` lets tests make a gated request until the Wallets slice replaces it.
 */
export function financesRoutes(deps: Deps) {
  return createAppRouter("finances", deps)
    .get("/ping", (c) => c.json({ ok: true }))
    .route("/accounts", accountRoutes(deps.db))
    .route("/categories", categoryRoutes(deps.db))
}

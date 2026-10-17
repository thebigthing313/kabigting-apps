import { accountRoutes } from "#server/apps/finances/accounts.ts"
import { categoryRoutes } from "#server/apps/finances/categories.ts"
import { scheduleRoutes } from "#server/apps/finances/schedules.ts"
import type { Deps } from "#server/core/context.ts"
import { createAppRouter } from "#server/core/create-app-router.ts"
import { walletRoutes } from "#server/apps/finances/wallets.ts"

/** The Finances App's API. Every resource is shared household data behind the App's access check. */
export function financesRoutes(deps: Deps) {
  return createAppRouter("finances", deps)
    .route("/accounts", accountRoutes(deps.db))
    .route("/categories", categoryRoutes(deps.db))
    .route("/wallets", walletRoutes(deps.db))
    .route("/schedules", scheduleRoutes(deps.db))
}

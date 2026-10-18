import { accountRoutes } from "#server/apps/finances/accounts.ts"
import { balanceCheckRoutes } from "#server/apps/finances/balance-checks.ts"
import { categoryRoutes } from "#server/apps/finances/categories.ts"
import { occurrenceRoutes } from "#server/apps/finances/occurrences.ts"
import { reconcileRoutes } from "#server/apps/finances/reconcile.ts"
import { scheduleRoutes } from "#server/apps/finances/schedules.ts"
import { settingsRoutes } from "#server/apps/finances/settings.ts"
import { transactionRoutes } from "#server/apps/finances/transactions.ts"
import { transferRoutes } from "#server/apps/finances/transfers.ts"
import type { Deps } from "#server/core/context.ts"
import { createAppRouter } from "#server/core/create-app-router.ts"
import { walletRoutes } from "#server/apps/finances/wallets.ts"

/** The Finances App's API. Every resource is shared household data behind the App's access check. */
export function financesRoutes(deps: Deps) {
  return createAppRouter("finances", deps)
    .route("/accounts", accountRoutes(deps.db))
    .route("/categories", categoryRoutes(deps.db))
    .route("/wallets", walletRoutes(deps.db))
    .route("/balance-checks", balanceCheckRoutes(deps.db))
    .route("/schedules", scheduleRoutes(deps.db))
    .route("/occurrences", occurrenceRoutes(deps.db))
    .route("/settings", settingsRoutes(deps.db))
    .route("/transactions", transactionRoutes(deps.db))
    .route("/transfers", transferRoutes(deps.db))
    .route("/", reconcileRoutes(deps.db))
}

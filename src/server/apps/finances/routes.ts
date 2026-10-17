import type { Deps } from "#server/core/context.ts"
import { createAppRouter } from "#server/core/create-app-router.ts"
import { walletRoutes } from "#server/apps/finances/wallets.ts"

/** The Finances App's API. Every row is shared household data, so there is no owner filter. */
export function financesRoutes(deps: Deps) {
  return createAppRouter("finances", deps).route("/wallets", walletRoutes(deps))
}

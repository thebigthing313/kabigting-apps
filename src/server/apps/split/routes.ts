import { categoryRoutes } from "#server/apps/split/categories.ts"
import { expenseRoutes } from "#server/apps/split/expenses.ts"
import { memberRoutes } from "#server/apps/split/members.ts"
import type { Deps } from "#server/core/context.ts"
import { createAppRouter } from "#server/core/create-app-router.ts"

/** The Split App's API. App access is the only gate: every Member sees and shares all of it. */
export function splitRoutes(deps: Deps) {
  return createAppRouter("split", deps)
    .route("/expenses", expenseRoutes(deps.db))
    .route("/categories", categoryRoutes(deps.db))
    .route("/members", memberRoutes(deps.db))
}

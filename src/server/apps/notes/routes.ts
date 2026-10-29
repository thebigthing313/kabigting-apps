import { itemRoutes } from "#server/apps/notes/items.ts"
import { noteRoutes } from "#server/apps/notes/notes.ts"
import type { Deps } from "#server/core/context.ts"
import { createAppRouter } from "#server/core/create-app-router.ts"

/**
 * The Notes App's API. App access is the outer gate; inside it, each Note is narrowed further to
 * those it is visible to (see `visibleTo`).
 */
export function notesRoutes(deps: Deps) {
  return createAppRouter("notes", deps)
    .route("/notes", noteRoutes(deps.db))
    .route("/items", itemRoutes(deps.db))
}

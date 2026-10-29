import { and, eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { toItemRow, touch } from "#server/apps/notes/items.ts"
import { visibleTo } from "#server/apps/notes/visibility.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { noteItems, notes } from "#server/db/schema/index.ts"
import { clearChecked, noteParams, type ClearedItems } from "#shared/notes/schemas.ts"

/**
 * Clear checked, `POST /notes/:id/clear-checked`: deletes the Items the clearer saw checked, but
 * only those still checked, so an Item someone unticked first survives. Like every content write
 * it passes `visibleTo`, so anyone who can see the Checklist may clear it and anyone else gets
 * 404. Ids of Items in another Checklist, or of Items already gone, are ignored.
 */
export function clearCheckedRoutes(db: Db) {
  return new Hono<AppEnv>().post(
    "/:id/clear-checked",
    validate("param", noteParams),
    validate("json", clearChecked),
    async (c) => {
      const noteId = c.req.valid("param").id
      const { itemIds } = c.req.valid("json")
      const accountId = c.get("account").id
      const result = await db.transaction(async (tx): Promise<ClearedItems> => {
        // Locking the Checklist makes the clear take its turn with every Item write to it, each of
        // which locks the Checklist too, so a tick or untick lands wholly before or after it.
        const [note] = await tx
          .select({ kind: notes.kind, editedAt: notes.editedAt })
          .from(notes)
          .where(and(eq(notes.id, noteId), visibleTo(accountId)))
          .for("update")
        if (!note) throw new ApiError("not_found", "No such Note")
        if (note.kind !== "checklist") {
          throw new ApiError("validation_failed", "Only a Checklist has Items")
        }
        const sent = and(eq(noteItems.noteId, noteId), inArray(noteItems.id, itemIds))
        const deleted =
          itemIds.length === 0
            ? []
            : await tx
                .delete(noteItems)
                .where(and(sent, eq(noteItems.checked, true)))
                .returning({ id: noteItems.id })
        const kept = itemIds.length === 0 ? [] : await tx.select().from(noteItems).where(sent)
        return {
          cleared: deleted.map((item) => item.id),
          kept: kept.map(toItemRow),
          // Clearing nothing is no edit: the Checklist keeps its place in the list.
          noteEditedAt: deleted.length > 0 ? await touch(tx, noteId) : note.editedAt.toISOString(),
        }
      })
      return c.json(result)
    },
  )
}

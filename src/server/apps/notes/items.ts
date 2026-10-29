import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { Hono } from "hono"
import { visibleTo } from "#server/apps/notes/visibility.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { noteItems, notes } from "#server/db/schema/index.ts"
import { bottomOfUnchecked } from "#shared/notes/items.ts"
import {
  clearChecked,
  createItem,
  itemParams,
  noteParams,
  updateItem,
  type ClearedChecked,
  type ItemRow,
  type ItemWrite,
} from "#shared/notes/schemas.ts"

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

function notFound(): never {
  throw new ApiError("not_found", "No such Item")
}

function toItemRow(item: typeof noteItems.$inferSelect): ItemRow {
  return {
    id: item.id,
    noteId: item.noteId,
    text: item.text,
    checked: item.checked,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    position: item.position,
  }
}

/**
 * The Checklist, if `accountId` may see it, locked until the write commits. Every write to a
 * Checklist's Items locks the Checklist before any Item, so they queue on it in one order and
 * never deadlock.
 */
async function lockChecklist(tx: Tx, accountId: string, noteId: string) {
  const [note] = await tx
    .select({ kind: notes.kind, editedAt: notes.editedAt })
    .from(notes)
    .where(and(eq(notes.id, noteId), visibleTo(accountId)))
    .for("update")
  return note
}

/**
 * The Item, if `accountId` may see its Checklist, locked after the Checklist (see
 * `lockChecklist`) until the write commits. An Item never moves to another Checklist.
 */
async function lockItem(tx: Tx, accountId: string, itemId: string) {
  const [found] = await tx
    .select({ noteId: noteItems.noteId })
    .from(noteItems)
    .where(eq(noteItems.id, itemId))
  const note = found && (await lockChecklist(tx, accountId, found.noteId))
  if (!found || !note) notFound()
  const [item] = await tx.select().from(noteItems).where(eq(noteItems.id, itemId)).for("update")
  return item ? { item, noteEditedAt: note.editedAt } : notFound()
}

/** Where an Item goes to join the bottom of its Checklist's unchecked Items. */
async function bottomPosition(tx: Tx, noteId: string): Promise<string> {
  const unchecked = await tx
    .select({ checked: noteItems.checked, position: noteItems.position })
    .from(noteItems)
    .where(and(eq(noteItems.noteId, noteId), eq(noteItems.checked, false)))
  return bottomOfUnchecked(unchecked)
}

/** Every Item write is an edit to its Checklist: it moves the Checklist's edited at forward. */
async function touch(tx: Tx, noteId: string): Promise<string> {
  const [note] = await tx
    .update(notes)
    .set({ editedAt: sql`now()` })
    .where(eq(notes.id, noteId))
    .returning({ editedAt: notes.editedAt })
  return (note ?? notFound()).editedAt.toISOString()
}

/**
 * A Checklist's Items. Each is reached only through its Checklist, so every read and write
 * passes the same `visibleTo` check as the Note itself, and an Item of a Note the caller can't
 * see answers 404. Each write touches only its own Item.
 */
export function itemRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const visibleNotes = db
        .select({ id: notes.id })
        .from(notes)
        .where(visibleTo(c.get("account").id))
      const rows = await db
        .select()
        .from(noteItems)
        .where(inArray(noteItems.noteId, visibleNotes))
        .orderBy(asc(noteItems.noteId), asc(noteItems.id))
      return c.json({ rows: rows.map(toItemRow) })
    })
    .post("/", validate("json", createItem), async (c) => {
      const { id, noteId, text } = c.req.valid("json")
      const accountId = c.get("account").id
      const written = await db.transaction(async (tx): Promise<ItemWrite> => {
        const [note] = await tx
          .select({ kind: notes.kind })
          .from(notes)
          .where(and(eq(notes.id, noteId), visibleTo(accountId)))
          .for("update")
        if (!note) throw new ApiError("not_found", "No such Note")
        if (note.kind !== "checklist") {
          throw new ApiError("validation_failed", "Only a Checklist has Items")
        }
        const [inserted] = await tx
          .insert(noteItems)
          .values({ id, noteId, text, position: await bottomPosition(tx, noteId) })
          .onConflictDoNothing({ target: noteItems.id })
          .returning()
        if (inserted) return { item: toItemRow(inserted), noteEditedAt: await touch(tx, noteId) }
        // The id is in use. An add retried after a lost response gets the stored Item back; an
        // Item the caller can't see, or one in another Checklist, answers 404 like any other.
        const stored = await lockItem(tx, accountId, id)
        if (stored.item.noteId !== noteId) notFound()
        return { item: toItemRow(stored.item), noteEditedAt: stored.noteEditedAt.toISOString() }
      })
      return c.json(written, 201)
    })
    .patch("/:id", validate("param", itemParams), validate("json", updateItem), async (c) => {
      const { text, checked, position } = c.req.valid("json")
      const itemId = c.req.valid("param").id
      const accountId = c.get("account").id
      const written = await db.transaction(async (tx): Promise<ItemWrite> => {
        const { item, noteEditedAt } = await lockItem(tx, accountId, itemId)
        // Only the fields sent are written; the last write to the same field wins. A tick keeps
        // the time of the first one, and only an Item that was checked moves when unticked.
        const tick =
          checked === true && !item.checked
            ? { checked: true, checkedAt: sql`now()` }
            : checked === false && item.checked
              ? {
                  checked: false,
                  checkedAt: null,
                  position: await bottomPosition(tx, item.noteId),
                }
              : {}
        // A move sets only this Item's key, so moves of different Items never undo each other.
        // Checked Items order by their tick, so a move that reaches one checked meanwhile is moot
        // and changes nothing.
        const move =
          position === undefined || position === item.position || (checked ?? item.checked)
            ? {}
            : { position }
        const changes = {
          ...(text === undefined || text === item.text ? {} : { text }),
          ...tick,
          ...move,
        }
        // A write that changes nothing, such as a second tick, is no edit: the Checklist keeps
        // its place in the list.
        if (Object.keys(changes).length === 0) {
          return { item: toItemRow(item), noteEditedAt: noteEditedAt.toISOString() }
        }
        const [updated] = await tx
          .update(noteItems)
          .set(changes)
          .where(eq(noteItems.id, itemId))
          .returning()
        return {
          item: toItemRow(updated ?? notFound()),
          noteEditedAt: await touch(tx, item.noteId),
        }
      })
      return c.json(written)
    })
    .delete("/:id", validate("param", itemParams), async (c) => {
      const itemId = c.req.valid("param").id
      const accountId = c.get("account").id
      const written = await db.transaction(async (tx): Promise<ItemWrite> => {
        const { item } = await lockItem(tx, accountId, itemId)
        await tx.delete(noteItems).where(eq(noteItems.id, itemId))
        return { item: toItemRow(item), noteEditedAt: await touch(tx, item.noteId) }
      })
      return c.json(written)
    })
}

/**
 * Clear checked, mounted under `/notes` as `POST /notes/:id/clear-checked`: deletes the Items the
 * clearer saw checked, but only those still checked, so an Item someone unticked first survives.
 * Like every Item write it passes `visibleTo`, so anyone who can see the Checklist may clear it
 * and anyone else gets 404. Ids of Items in another Checklist, or of Items already gone, are
 * ignored.
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
      const result = await db.transaction(async (tx): Promise<ClearedChecked> => {
        // Holding the Checklist, the clear takes its turn with every other Item write to it, so a
        // tick or untick lands wholly before or after it.
        const note = await lockChecklist(tx, accountId, noteId)
        if (!note) throw new ApiError("not_found", "No such Note")
        if (note.kind !== "checklist") {
          throw new ApiError("validation_failed", "Only a Checklist has Items")
        }
        const sent = and(eq(noteItems.noteId, noteId), inArray(noteItems.id, itemIds))
        const deleted = await tx
          .delete(noteItems)
          .where(and(sent, eq(noteItems.checked, true)))
          .returning({ id: noteItems.id })
        const kept = await tx.select().from(noteItems).where(sent)
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

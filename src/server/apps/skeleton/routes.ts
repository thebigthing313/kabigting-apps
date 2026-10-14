import { and, asc, eq, gt, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import type { Deps } from "#server/core/context.ts"
import { createAppRouter } from "#server/core/create-app-router.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import { skeletonNotes } from "#server/db/schema/index.ts"
import { id } from "#shared/schemas/primitives.ts"
import { createNote, noteQuery, updateNote, type NoteRow } from "#shared/schemas/skeleton.ts"

type NoteRecord = typeof skeletonNotes.$inferSelect

function toRow(note: NoteRecord): NoteRow {
  return {
    id: note.id,
    text: note.text,
    amountCents: note.amountCents,
    onDate: note.onDate,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  }
}

const noteParams = z.strictObject({ id })

function ownNote(noteId: string, accountId: string) {
  return and(eq(skeletonNotes.id, noteId), eq(skeletonNotes.userId, accountId))
}

function notFound(): never {
  throw new ApiError("not_found", "No such note")
}

export function skeletonRoutes(deps: Deps) {
  const { db } = deps

  return createAppRouter("skeleton", deps)
    .post("/notes/query", validate("json", noteQuery), async (c) => {
      const { ids, limit, after } = c.req.valid("json")
      const notes = await db
        .select()
        .from(skeletonNotes)
        .where(
          and(
            eq(skeletonNotes.userId, c.get("account").id),
            ids ? inArray(skeletonNotes.id, ids) : undefined,
            after ? gt(skeletonNotes.id, after) : undefined,
          ),
        )
        .orderBy(asc(skeletonNotes.id))
        .limit(limit ?? 5000)
      return c.json({ rows: notes.map(toRow) })
    })
    .post("/notes", validate("json", createNote), async (c) => {
      // The client supplies the id; an existing id is a conflict, never an overwrite.
      const [note] = await db
        .insert(skeletonNotes)
        .values({ ...c.req.valid("json"), userId: c.get("account").id })
        .onConflictDoNothing()
        .returning()
      if (!note) throw new ApiError("conflict", "A note with this id already exists")
      return c.json(toRow(note), 201)
    })
    .patch("/notes/:id", validate("param", noteParams), validate("json", updateNote), async (c) => {
      const [note] = await db
        .update(skeletonNotes)
        .set({ ...c.req.valid("json"), updatedAt: sql`now()` })
        .where(ownNote(c.req.valid("param").id, c.get("account").id))
        .returning()
      return note ? c.json(toRow(note)) : notFound()
    })
    .delete("/notes/:id", validate("param", noteParams), async (c) => {
      const [note] = await db
        .delete(skeletonNotes)
        .where(ownNote(c.req.valid("param").id, c.get("account").id))
        .returning()
      return note ? c.json(toRow(note)) : notFound()
    })
}

import { and, desc, eq, sql, type SQL } from "drizzle-orm"
import { Hono } from "hono"
import { visibleTo } from "#server/apps/notes/visibility.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { auth_user, notes } from "#server/db/schema/index.ts"
import { titleOrNull } from "#shared/notes/notes.ts"
import { createNote, noteParams, updateNote, type NoteRow } from "#shared/notes/schemas.ts"

function notFound(): never {
  throw new ApiError("not_found", "No such Note")
}

/** The Notes `accountId` may see that also match `where`, as wire rows, newest edit first. */
async function readNotes(db: Db, accountId: string, where?: SQL): Promise<NoteRow[]> {
  const rows = await db
    .select({ note: notes, creatorName: auth_user.name })
    .from(notes)
    .innerJoin(auth_user, eq(auth_user.id, notes.creatorId))
    .where(and(visibleTo(accountId), where))
    .orderBy(desc(notes.editedAt), desc(notes.id))
  return rows.map(({ note, creatorName }) => ({
    id: note.id,
    kind: note.kind,
    title: note.title,
    body: note.body,
    creator: { id: note.creatorId, name: creatorName },
    createdAt: note.createdAt.toISOString(),
    editedAt: note.editedAt.toISOString(),
  }))
}

async function readNote(db: Db, accountId: string, noteId: string): Promise<NoteRow> {
  const [row] = await readNotes(db, accountId, eq(notes.id, noteId))
  return row ?? notFound()
}

/** Notes: each visible only as `visibleTo` allows; the Creator alone deletes. */
export function noteRoutes(db: Db) {
  return new Hono<AppEnv>()
    .get("/", async (c) => c.json({ rows: await readNotes(db, c.get("account").id) }))
    .post("/", validate("json", createNote), async (c) => {
      const input = c.req.valid("json")
      const { id, kind, title } = input
      const accountId = c.get("account").id
      // A Text note always has a body, empty or not; a Checklist never does.
      const body = input.kind === "text" ? (input.body ?? "") : null
      // The client supplies the id. An id already in use is never overwritten: a create retried
      // after a lost response gets the stored Note back, and a Note the caller can't see answers
      // 404 like any other, so its existence never leaks.
      await db
        .insert(notes)
        .values({ id, kind, title: titleOrNull(title), body, creatorId: accountId })
        .onConflictDoNothing({ target: notes.id })
      return c.json(await readNote(db, accountId, id), 201)
    })
    .patch("/:id", validate("param", noteParams), validate("json", updateNote), async (c) => {
      const { title, body } = c.req.valid("json")
      const noteId = c.req.valid("param").id
      const accountId = c.get("account").id
      // Only the fields sent are written, so two people editing different fields both keep
      // their change; the last write to the same field wins.
      const [updated] = await db
        .update(notes)
        .set({
          ...(title === undefined ? {} : { title: titleOrNull(title) }),
          ...(body === undefined ? {} : { body }),
          editedAt: sql`now()`,
        })
        .where(
          and(
            eq(notes.id, noteId),
            visibleTo(accountId),
            // Only a Text note has a body.
            body === undefined ? undefined : eq(notes.kind, "text"),
          ),
        )
        .returning({ id: notes.id })
      if (!updated) {
        // A Note the caller can't see is 404; one they can see wasn't written for its kind.
        await readNote(db, accountId, noteId)
        throw new ApiError("validation_failed", "A Checklist has no body")
      }
      return c.json(await readNote(db, accountId, noteId))
    })
    .delete("/:id", validate("param", noteParams), async (c) => {
      const noteId = c.req.valid("param").id
      const accountId = c.get("account").id
      const note = await readNote(db, accountId, noteId)
      // Only the Creator deletes, and it is permanent: there is no trash.
      const [deleted] = await db
        .delete(notes)
        .where(and(eq(notes.id, noteId), eq(notes.creatorId, accountId)))
        .returning({ id: notes.id })
      if (!deleted) notFound()
      return c.json(note)
    })
}

import { and, asc, desc, eq, exists, inArray, isNull, notInArray, sql, type SQL } from "drizzle-orm"
import { Hono } from "hono"
import { addableAmong } from "#server/apps/notes/people.ts"
import { visibleTo } from "#server/apps/notes/visibility.ts"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import { subquery, type Db } from "#server/db/client.ts"
import { auth_user, noteAudience, notes } from "#server/db/schema/index.ts"
import { titleOrNull } from "#shared/notes/notes.ts"
import {
  createNote,
  noteParams,
  replaceAudience,
  updateNote,
  type NotePerson,
  type NoteRow,
} from "#shared/notes/schemas.ts"

function notFound(): never {
  throw new ApiError("not_found", "No such Note")
}

/** The Note is visible to the caller, who is in its Audience but is not its Creator. */
function creatorOnly(action: string): never {
  throw new ApiError("forbidden_creator", `Only the note's creator can ${action}`)
}

/** Each Note's Audience, in the order its members were added. */
async function audiencesOf(db: Db, noteIds: string[]): Promise<Map<string, NotePerson[]>> {
  const audiences = new Map<string, NotePerson[]>()
  if (noteIds.length === 0) return audiences
  const rows = await db
    .select({ noteId: noteAudience.noteId, id: auth_user.id, name: auth_user.name })
    .from(noteAudience)
    .innerJoin(auth_user, eq(auth_user.id, noteAudience.accountId))
    .where(inArray(noteAudience.noteId, noteIds))
    .orderBy(asc(noteAudience.addedAt), asc(auth_user.name))
  for (const { noteId, id, name } of rows) {
    audiences.set(noteId, [...(audiences.get(noteId) ?? []), { id, name }])
  }
  return audiences
}

/**
 * The Audience row that makes a Note Unopened for `accountId`: theirs, not yet opened since they
 * were last added. `noteId` is a Note's id or the outer query's `notes.id`. The Creator has no
 * Audience row, so their own Notes never match.
 */
function unopenedRow(noteId: string | typeof notes.id, accountId: string): SQL {
  return (
    and(
      eq(noteAudience.noteId, noteId),
      eq(noteAudience.accountId, accountId),
      isNull(noteAudience.openedAt),
    ) ?? sql`false`
  )
}

/** Whether each Note in the outer query is Unopened for `accountId`. */
function unopenedBy(accountId: string): SQL {
  return exists(
    subquery
      .select({ noteId: noteAudience.noteId })
      .from(noteAudience)
      .where(unopenedRow(notes.id, accountId)),
  )
}

/**
 * The Notes `accountId` may see that also match `where`, as wire rows, newest edit first. The
 * client does the final ordering, Unopened first (`orderNotes`).
 */
async function readNotes(db: Db, accountId: string, where?: SQL): Promise<NoteRow[]> {
  const rows = await db
    .select({
      note: notes,
      creatorName: auth_user.name,
      unopened: unopenedBy(accountId).mapWith(Boolean),
    })
    .from(notes)
    .innerJoin(auth_user, eq(auth_user.id, notes.creatorId))
    .where(and(visibleTo(accountId), where))
    .orderBy(desc(notes.editedAt), desc(notes.id))
  const audiences = await audiencesOf(
    db,
    rows.map(({ note }) => note.id),
  )
  return rows.map(({ note, creatorName, unopened }) => ({
    id: note.id,
    kind: note.kind,
    title: note.title,
    body: note.body,
    creator: { id: note.creatorId, name: creatorName },
    audience: audiences.get(note.id) ?? [],
    unopened,
    createdAt: note.createdAt.toISOString(),
    editedAt: note.editedAt.toISOString(),
  }))
}

async function readNote(db: Db, accountId: string, noteId: string): Promise<NoteRow> {
  const [row] = await readNotes(db, accountId, eq(notes.id, noteId))
  return row ?? notFound()
}

/**
 * Notes: each visible only as `visibleTo` allows, and editable by everyone it is visible to. The
 * Creator alone deletes it or changes its Audience; anyone else it is visible to gets 403. An
 * Audience member alone Leaves it.
 */
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
      if (note.creator.id !== accountId) creatorOnly("delete it")
      // Permanent: there is no trash. Its Audience goes with it.
      const [deleted] = await db
        .delete(notes)
        .where(and(eq(notes.id, noteId), eq(notes.creatorId, accountId)))
        .returning({ id: notes.id })
      if (!deleted) notFound()
      return c.json(note)
    })
    .post("/:id/open", validate("param", noteParams), async (c) => {
      const noteId = c.req.valid("param").id
      const accountId = c.get("account").id
      // A Note the caller can't see is 404 before anything is written.
      await readNote(db, accountId, noteId)
      // Only the caller's own Audience row, and only while Unopened, so the first open's time
      // stays. Not a content change, so edited at stays. The Creator has no row: a no-op.
      await db
        .update(noteAudience)
        .set({ openedAt: sql`now()` })
        .where(unopenedRow(noteId, accountId))
      return c.json(await readNote(db, accountId, noteId))
    })
    .put(
      "/:id/audience",
      validate("param", noteParams),
      validate("json", replaceAudience),
      async (c) => {
        const noteId = c.req.valid("param").id
        const accountId = c.get("account").id
        const wanted = [...new Set(c.req.valid("json").accountIds)]
        await db.transaction(async (tx) => {
          // Locked until the change commits, so a delete or another Audience change waits.
          const [note] = await tx
            .select({ creatorId: notes.creatorId })
            .from(notes)
            .where(and(eq(notes.id, noteId), visibleTo(accountId)))
            .for("update")
          if (!note) notFound()
          if (note.creatorId !== accountId) creatorOnly("change who it's shared with")
          const members = await tx
            .select({ accountId: noteAudience.accountId })
            .from(noteAudience)
            .where(eq(noteAudience.noteId, noteId))
          const current = new Set(members.map((member) => member.accountId))
          const added = wanted.filter((id) => !current.has(id))
          // Not a content change, so edited at stays. A removed member's row goes, so adding
          // them back later starts a fresh row.
          await tx
            .delete(noteAudience)
            .where(
              and(
                eq(noteAudience.noteId, noteId),
                wanted.length > 0 ? notInArray(noteAudience.accountId, wanted) : undefined,
              ),
            )
          if (added.length === 0) return
          // Someone already in the Audience may stay whatever their access now; anyone added
          // must hold App access to Notes as the insert runs, and the Creator is never in their
          // own Audience. Anyone refused undoes the whole change.
          const inserted = await tx
            .insert(noteAudience)
            .select((qb) =>
              qb
                .select({
                  noteId: sql<string>`${noteId}::uuid`.as("note_id"),
                  accountId: auth_user.id,
                  addedAt: sql<Date>`now()`.as("added_at"),
                  openedAt: sql<Date | null>`null`.as("opened_at"),
                })
                .from(auth_user)
                .where(addableAmong(accountId, added)),
            )
            .onConflictDoNothing()
            .returning({ accountId: noteAudience.accountId })
          const stored = new Set(inserted.map((row) => row.accountId))
          const refused = added.filter((id) => !stored.has(id))
          if (refused.length > 0) {
            throw new ApiError(
              "validation_failed",
              "Only people with access to Notes can be added",
              {
                accountIds: refused,
              },
            )
          }
        })
        return c.json(await readNote(db, accountId, noteId))
      },
    )
    .post("/:id/leave", validate("param", noteParams), async (c) => {
      const noteId = c.req.valid("param").id
      const accountId = c.get("account").id
      const note = await readNote(db, accountId, noteId)
      // The Creator has no Audience membership to give up; they delete the Note instead.
      if (note.creator.id === accountId) {
        throw new ApiError("forbidden_creator", "The note's creator can't leave it")
      }
      // Only the caller's own Audience membership goes, so only the Creator can add them back,
      // and a fresh one then starts Unopened. Not a content change, so edited at stays. The
      // Creator's App access is never checked: a member can always step away.
      const [left] = await db
        .delete(noteAudience)
        .where(and(eq(noteAudience.noteId, noteId), eq(noteAudience.accountId, accountId)))
        .returning({ noteId: noteAudience.noteId })
      if (!left) notFound()
      return c.json({ id: noteId })
    })
}

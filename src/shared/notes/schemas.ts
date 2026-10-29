/** Wire schemas for the Notes App's API. */
import { z } from "zod"
import { id, instant } from "../schemas/primitives.ts"

/** A Note's kind, fixed when it is made. */
export const NOTE_KINDS = ["text", "checklist"] as const
export const noteKind = z.enum(NOTE_KINDS)
export type NoteKind = z.infer<typeof noteKind>

/** One line, kept exactly as typed. Empty means no title. */
const title = z
  .string()
  .max(200, "Keep the title under 200 characters")
  .regex(/^[^\r\n]*$/, "A title is one line")
  .nullable()

/** Plain text, kept exactly as typed: line breaks and spacing included. */
const body = z.string().max(100_000, "This note is too long")

/** The caller becomes the Creator, so the body never names one. */
export const createNote = z.strictObject({
  id,
  // Only Text notes can be made until Checklists arrive.
  kind: z.literal("text"),
  title: title.optional(),
  body: body.optional(),
})

/** Each field is written on its own; send only what changed. */
export const updateNote = z
  .strictObject({ title, body })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Change at least one field")

export const noteParams = z.strictObject({ id })

/** An Account as Notes shows it. */
export const notePerson = z.object({ id: z.string(), name: z.string() })

export const noteRow = z.object({
  id,
  kind: noteKind,
  /** Null when the Note has no title. */
  title: z.string().nullable(),
  /** Null for a Checklist. */
  body: z.string().nullable(),
  creator: notePerson,
  createdAt: instant,
  /** Server time of the last change to the Note's content. */
  editedAt: instant,
})

export const noteRows = z.object({ rows: z.array(noteRow) })

export type CreateNote = z.infer<typeof createNote>
/** The kinds of Note the New menu can start. */
export type NewNoteKind = CreateNote["kind"]
export type UpdateNote = z.infer<typeof updateNote>
export type NotePerson = z.infer<typeof notePerson>
export type NoteRow = z.infer<typeof noteRow>

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

/**
 * The caller becomes the Creator, so the body never names one. A Checklist has no body; its
 * Items are added one by one once it exists.
 */
export const createNote = z.discriminatedUnion("kind", [
  z.strictObject({ id, kind: z.literal("text"), title: title.optional(), body: body.optional() }),
  z.strictObject({ id, kind: z.literal("checklist"), title: title.optional() }),
])

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

/** One line of plain text, kept exactly as typed. */
const itemText = z
  .string()
  .max(1_000, "Keep an Item under 1,000 characters")
  .regex(/^[^\r\n]*$/, "An Item is one line")

/** An Item joins the bottom of its Checklist's unchecked Items; the server places it. */
export const createItem = z.strictObject({ id, noteId: id, text: itemText })

/**
 * Each field is written on its own; send only what changed. Ticking stamps the server's time;
 * unticking returns the Item to the bottom of the unchecked Items.
 */
export const updateItem = z
  .strictObject({ text: itemText, checked: z.boolean() })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Change at least one field")

export const itemParams = z.strictObject({ id })

export const itemRow = z.object({
  id,
  noteId: id,
  text: z.string(),
  checked: z.boolean(),
  /** Server time of the tick; null while unchecked. */
  checkedAt: instant.nullable(),
  /** A sortable key among the Checklist's unchecked Items (see `orderItems`). */
  position: z.string(),
})

export const itemRows = z.object({ rows: z.array(itemRow) })

/**
 * What an Item write answers: the Item as stored (or as it was, for a delete) and its Checklist's
 * new edited at, as every Item write is an edit to the Checklist.
 */
export const itemWrite = z.object({ item: itemRow, noteEditedAt: instant })

export type CreateNote = z.infer<typeof createNote>
/** The kinds of Note the New menu can start. */
export type NewNoteKind = NoteKind
export type UpdateNote = z.infer<typeof updateNote>
export type NotePerson = z.infer<typeof notePerson>
export type NoteRow = z.infer<typeof noteRow>
export type CreateItem = z.infer<typeof createItem>
export type UpdateItem = z.infer<typeof updateItem>
export type ItemRow = z.infer<typeof itemRow>
export type ItemWrite = z.infer<typeof itemWrite>

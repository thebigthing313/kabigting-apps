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
  /** The Accounts, besides the Creator, it is shared with; empty when private. */
  audience: z.array(notePerson),
  createdAt: instant,
  /** Server time of the last change to the Note's content. */
  editedAt: instant,
})

export const noteRows = z.object({ rows: z.array(noteRow) })

/** The Creator replaces the whole Audience at once; an empty set makes the Note private. */
export const replaceAudience = z.strictObject({
  accountIds: z.array(z.string().min(1)).max(100, "That's too many people"),
})

/** The Accounts a Creator can add to an Audience: those holding App access to Notes. */
export const notePeople = z.object({ rows: z.array(notePerson) })
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

/**
 * Clear checked: the ids of the Items the clearer saw checked. Only those still checked in this
 * Checklist are deleted, so an Item someone unticked meanwhile survives.
 */
export const clearChecked = z.strictObject({
  itemIds: z.array(id).max(10_000, "Too many Items to clear at once"),
})

/**
 * What Clear checked answers: the ids it deleted; the Items sent that are in the Checklist but no
 * longer checked, as stored; and the Checklist's edited at, which moves only when something was
 * deleted. Ids sent that are in no Item of this Checklist are ignored.
 */
export const clearedItems = z.object({
  cleared: z.array(id),
  kept: z.array(itemRow),
  noteEditedAt: instant,
})

export type CreateNote = z.infer<typeof createNote>
export type UpdateNote = z.infer<typeof updateNote>
export type ReplaceAudience = z.infer<typeof replaceAudience>
export type NotePerson = z.infer<typeof notePerson>
export type NoteRow = z.infer<typeof noteRow>
export type CreateItem = z.infer<typeof createItem>
export type UpdateItem = z.infer<typeof updateItem>
export type ItemRow = z.infer<typeof itemRow>
export type ItemWrite = z.infer<typeof itemWrite>
export type ClearChecked = z.infer<typeof clearChecked>
export type ClearedItems = z.infer<typeof clearedItems>

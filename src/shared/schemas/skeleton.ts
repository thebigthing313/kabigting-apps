/** Wire schemas for the disposable skeleton App's notes. Deleted when the finances port begins. */
import { z } from "zod"
import { cents, id, instant, isoDate } from "./primitives.ts"
import { queryBody, rowsResponse } from "./query.ts"

const text = z.string().trim().min(1).max(500)

export const createNote = z.strictObject({ id, text, amountCents: cents, onDate: isoDate })

export const updateNote = z
  .strictObject({ text, amountCents: cents, onDate: isoDate })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Change at least one field")

export const noteRow = z.object({
  id,
  text: z.string(),
  amountCents: cents,
  onDate: isoDate,
  createdAt: instant,
  updatedAt: instant,
})

export const noteQuery = queryBody({})
export const noteRows = rowsResponse(noteRow)

export type CreateNote = z.infer<typeof createNote>
export type UpdateNote = z.infer<typeof updateNote>
export type NoteRow = z.infer<typeof noteRow>

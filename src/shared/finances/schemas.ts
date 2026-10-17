/** Wire schemas for the Finances App's resources. */
import { z } from "zod"
import { id, instant } from "../schemas/primitives.ts"
import { queryBody, rowsResponse } from "../schemas/query.ts"

/** A unique display name, trimmed; the database enforces uniqueness. */
const name = z.string().trim().min(1, "Enter a name").max(100)
const note = z.string().trim().max(1000)

function atLeastOneField(patch: object) {
  return Object.keys(patch).length > 0
}

// Accounts: whoever money is paid to or received from.

export const createAccount = z.strictObject({ id, name, note: note.optional() })

export const updateAccount = z
  .strictObject({ name, note, archived: z.boolean() })
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const accountRow = z.object({
  id,
  name: z.string(),
  note: z.string(),
  archived: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
})

export const accountQuery = queryBody({})
export const accountRows = rowsResponse(accountRow)

export type UpdateAccount = z.infer<typeof updateAccount>
export type AccountRow = z.infer<typeof accountRow>

// Categories: one flat list of reporting labels, archived or merged but never deleted.

export const createCategory = z.strictObject({ id, name })

export const updateCategory = z
  .strictObject({ name, archived: z.boolean() })
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const categoryRow = z.object({
  id,
  name: z.string(),
  archived: z.boolean(),
  mergedIntoId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

export const categoryQuery = queryBody({})
export const categoryRows = rowsResponse(categoryRow)

export type UpdateCategory = z.infer<typeof updateCategory>
export type CategoryRow = z.infer<typeof categoryRow>

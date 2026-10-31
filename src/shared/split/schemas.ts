/** Wire schemas for the Split App's API. */
import { z } from "zod"
import { cents, id, instant, isoDate } from "../schemas/primitives.ts"

/** An Account's id, as Better Auth makes it: an opaque string, not a UUID. */
export const memberId = z.string().min(1).max(100)

/**
 * How one side of an Expense is divided. Every mode is stored; only Equal is accepted so far, and
 * Exact and Percent join it with the full Split mode editor.
 */
export const SPLIT_MODES = ["equal", "exact", "percent"] as const
export type SplitMode = (typeof SPLIT_MODES)[number]
export const ACCEPTED_SPLIT_MODES = ["equal"] as const satisfies readonly SplitMode[]

/**
 * One side of an Expense as entered: its Split mode and the inputs of every mode, so switching
 * modes keeps what was typed. Only the inputs of `mode` count.
 */
export const side = z.strictObject({
  mode: z.enum(ACCEPTED_SPLIT_MODES),
  /** Equal: the Members ticked. */
  ticked: z
    .array(memberId)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Tick each Member once"),
  /** Exact: cents per Member, null while blank. */
  exact: z.record(memberId, cents.nullable()),
  /** Percent: as typed, up to two decimals. */
  percent: z.record(memberId, z.string().max(10)),
})

/** Member id → cents. Only nonzero shares are kept. */
export const shares = z.record(memberId, cents)

const description = z.string().max(200, "Keep the description under 200 characters")
const note = z.string().max(2_000, "Keep the note under 2,000 characters")

/**
 * A new Expense under an id the client made. The caller is who added it. The server works out the
 * Paid and Owed shares from each side itself, so a client can't save shares that don't add up.
 */
export const createExpense = z.strictObject({
  id,
  description,
  date: isoDate,
  categoryId: id,
  /** Cents, never zero: positive for a cost, negative for a Refund (not an outflow Amount). */
  total: cents,
  note,
  paid: side,
  owed: side,
})

/**
 * A saved Expense as it now stands, replacing all of it: both sides and every share. The caller is
 * who changed it last.
 */
export const updateExpense = createExpense.omit({ id: true })

export const expenseRow = z.object({
  id,
  description: z.string(),
  date: isoDate,
  categoryId: id,
  total: cents,
  note: z.string(),
  paid: side,
  owed: side,
  /** The cents worked out at save: the truth for Balances. */
  paidShares: shares,
  owedShares: shares,
  /** The Account that added it. */
  addedBy: memberId,
  addedAt: instant,
  /** The Account that saved it last; who added it until someone changes it. */
  changedBy: memberId,
  changedAt: instant,
})

export const expenseRows = z.object({ rows: z.array(expenseRow) })

/** A Member as Split shows them; `members` lists them oldest Account first. */
export const member = z.object({ id: memberId, name: z.string() })
export const members = z.object({ rows: z.array(member) })

export const categoryRow = z.object({ id, name: z.string(), archived: z.boolean() })
export const categoryRows = z.object({ rows: z.array(categoryRow) })

/** A Category's name, trimmed; unique regardless of case, which the database enforces. */
const categoryName = z.string().trim().min(1, "Enter a name").max(100)

/** A new Category under an id the client made. It starts in use. */
export const createCategory = z.strictObject({ id, name: categoryName })

/** Renaming or archiving a Category, or both. There is no delete. */
export const updateCategory = z
  .strictObject({ name: categoryName, archived: z.boolean() })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, "Change at least one field")

export type Side = z.infer<typeof side>
export type Shares = z.infer<typeof shares>
export type CreateExpense = z.infer<typeof createExpense>
export type UpdateExpense = z.infer<typeof updateExpense>
export type ExpenseRow = z.infer<typeof expenseRow>
export type Member = z.infer<typeof member>
export type CategoryRow = z.infer<typeof categoryRow>
export type UpdateCategory = z.infer<typeof updateCategory>

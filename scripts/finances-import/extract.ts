/**
 * The normalised extract that `scripts/finances-extract.ps1` writes: five JSON files with neutral
 * table and field names, whatever the old database called them. Parsing turns ids into strings,
 * amounts into cents and dates into `YYYY-MM-DD`; it never echoes a value in its errors.
 */
import { z } from "zod"
import { parse as parseMoney } from "#shared/money.ts"

export const EXTRACT_FILES = [
  "categories",
  "schedules",
  "transactions",
  "ledger",
  "balances",
] as const
export type ExtractFile = (typeof EXTRACT_FILES)[number]

/** The fields each file holds, as the extract map names them. */
export const EXTRACT_FIELDS = {
  categories: ["id", "name"],
  schedules: ["id", "name", "categoryId"],
  transactions: ["id", "scheduleId", "date", "amount", "note", "pending", "posted"],
  ledger: [
    "id",
    "isExpense",
    "transactionId",
    "date",
    "payee",
    "amount",
    "categoryId",
    "note",
    "bankDescription",
    "bankDate",
  ],
  balances: ["id", "enteredAt", "amount"],
} as const satisfies Record<ExtractFile, readonly string[]>

export type Kind = "expense" | "income"
export type OldCategory = { id: string; name: string }
export type OldSchedule = { id: string; kind: Kind; name: string; categoryId: string | null }
export type OldTransaction = {
  id: string
  kind: Kind
  scheduleId: string | null
  date: string | null
  /** As stored: unsigned, except the odd credit stored negative. */
  amountCents: number
  note: string | null
  pending: boolean
  posted: boolean
}
export type OldLedgerRow = {
  id: string
  isExpense: boolean
  /** An expense transaction's id when `isExpense`, else an income transaction's. */
  transactionId: string | null
  date: string | null
  payee: string | null
  /** The full figure, unsigned as stored. */
  amountCents: number
  categoryId: string | null
  note: string | null
  bankDescription: string | null
  bankDate: string | null
}
/** A hand-typed Checking balance; `enteredAt` is household local time. */
export type OldBalance = { id: string; enteredAt: string; amountCents: number }

export type Extract = {
  categories: OldCategory[]
  schedules: OldSchedule[]
  transactions: OldTransaction[]
  ledger: OldLedgerRow[]
  balances: OldBalance[]
}

const id = z.union([z.string().min(1), z.number()]).transform(String)
const optionalId = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((value) =>
    value === undefined || value === null || value === "" ? null : String(value),
  )
const text = z
  .string()
  .nullable()
  .optional()
  .transform((value) => value ?? null)
const flag = z
  .union([z.boolean(), z.number(), z.null()])
  .optional()
  .transform((value) => value === true || (typeof value === "number" && value !== 0))
/** A flag that decides a sign, so a missing one is an error rather than false. */
const requiredFlag = z
  .union([z.boolean(), z.number()])
  .transform((value) => value === true || (typeof value === "number" && value !== 0))
const cents = z.union([z.string(), z.number()]).transform((value, context) => {
  const parsed = parseMoney(String(value))
  if (parsed === null) {
    context.addIssue({ code: "custom", message: "not an amount in dollars and cents" })
    return z.NEVER
  }
  return parsed
})
/** A calendar date, from `YYYY-MM-DD` with or without a time part. */
const date = z
  .string()
  .nullable()
  .optional()
  .transform((value, context) => {
    if (value === undefined || value === null || value === "") return null
    const match = /^(\d{4}-\d{2}-\d{2})(?:[T ].*)?$/.exec(value)
    if (!match?.[1]) {
      context.addIssue({ code: "custom", message: "not a YYYY-MM-DD date" })
      return z.NEVER
    }
    return match[1]
  })
const kind = z.enum(["expense", "income"])

/** The extract calls it `amount`, in dollars; rows carry it as cents. */
function renameAmount<T extends { amount: number }>({ amount, ...row }: T) {
  return { ...row, amountCents: amount }
}

const schemas = {
  categories: z.object({ id, name: z.string() }),
  schedules: z.object({ id, kind, name: z.string(), categoryId: optionalId }),
  transactions: z
    .object({
      id,
      kind,
      scheduleId: optionalId,
      date,
      amount: cents,
      note: text,
      pending: flag,
      posted: flag,
    })
    .transform(renameAmount),
  ledger: z
    .object({
      id,
      isExpense: requiredFlag,
      transactionId: optionalId,
      date,
      payee: text,
      amount: cents,
      categoryId: optionalId,
      note: text,
      bankDescription: text,
      bankDate: date,
    })
    .transform(renameAmount),
  balances: z
    .object({
      id,
      enteredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "not a timestamp"),
      amount: cents,
    })
    .transform(renameAmount),
} satisfies Record<ExtractFile, z.ZodType>

/** Thrown for a malformed extract; names files, rows and fields, never their values. */
export class ExtractError extends Error {}

function parseFile<F extends ExtractFile>(file: F, raw: unknown): z.output<(typeof schemas)[F]>[] {
  if (!Array.isArray(raw)) throw new ExtractError(`${file}.json is not a JSON array`)
  const result = z.array(schemas[file]).safeParse(raw)
  if (result.success) return result.data
  const problems = result.error.issues
    .slice(0, 10)
    .map(
      (issue) =>
        `row ${String(issue.path[0])}, ${issue.path.slice(1).join(".") || "row"}: ${issue.message}`,
    )
  const more =
    result.error.issues.length > 10 ? ` (and ${result.error.issues.length - 10} more)` : ""
  throw new ExtractError(`${file}.json is malformed:\n  ${problems.join("\n  ")}${more}`)
}

/** Parses the five files' JSON contents into an Extract, or throws an ExtractError. */
export function parseExtract(raw: Record<ExtractFile, unknown>): Extract {
  return {
    categories: parseFile("categories", raw.categories),
    schedules: parseFile("schedules", raw.schedules),
    transactions: parseFile("transactions", raw.transactions),
    ledger: parseFile("ledger", raw.ledger),
    balances: parseFile("balances", raw.balances),
  }
}

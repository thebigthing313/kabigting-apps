/**
 * Reads the Splitwise snapshot that `pnpm split:fetch` writes: the raw `get_group` body and every
 * `get_expenses` page in offset order. Rows are flattened into one list and numbered from 1 in
 * that order, which is how every message names them. Nothing here echoes a value: a row that
 * doesn't have the expected shape is reported by its number and the fields at fault.
 */
import { z } from "zod"
import { expenseRows } from "../split-fetch/fetch.ts"

export class SnapshotInvalid extends Error {}

/** Splitwise ids arrive as numbers; they are kept as digit strings. */
const splitwiseId = z.union([z.int().nonnegative(), z.string().regex(/^\d+$/)]).transform(String)

const userRow = z.object({
  user_id: splitwiseId,
  paid_share: z.string(),
  owed_share: z.string(),
})

const expenseRow = z.object({
  payment: z.boolean(),
  cost: z.string(),
  currency_code: z.string(),
  date: z.string(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  description: z.string().nullable(),
  details: z.string().nullish(),
  category: z.object({ name: z.string() }).nullish(),
  users: z.array(userRow),
})

/** Only `deleted_at` is read before a row is skipped, so a deleted row is never checked further. */
const deletedAt = z.object({ deleted_at: z.string().nullish() })

const balanceRow = z.object({ currency_code: z.string(), amount: z.string() })
const groupBody = z.object({
  group: z.object({
    members: z.array(z.object({ id: splitwiseId, balance: z.array(balanceRow) })),
  }),
})

const snapshotFile = z.object({
  group: z.unknown(),
  expensePages: z.array(z.unknown()),
})

export type SplitwiseUser = { userId: string; paidShare: string; owedShare: string }

/** One live row, as Splitwise gave it: amounts are still decimal strings. */
export type SplitwiseRow = {
  /** 1-based, in the snapshot's offset order. */
  row: number
  payment: boolean
  cost: string
  currency: string
  /** A UTC instant. */
  date: string
  /** When it was added in Splitwise, a UTC instant; checked when planned. */
  createdAt: string | null
  /** When it was last changed in Splitwise, if Splitwise says. */
  updatedAt: string | null
  description: string
  details: string
  /** Absent on some payment rows. */
  category: string | null
  users: SplitwiseUser[]
}

export type SplitwiseMember = { userId: string; balance: { currency: string; amount: string }[] }

export type Snapshot = {
  /** Every row read, deleted ones included. */
  rowsRead: number
  deleted: number
  rows: SplitwiseRow[]
  /** Rows not in the expected shape, with the fields at fault. */
  malformed: { row: number; fields: string[] }[]
  /** The group's members with their balances, in `get_group` order. */
  members: SplitwiseMember[]
}

/** The fields a Zod error points at, as `users[1].paid_share`, never the values. */
function fieldsOf(error: z.ZodError): string[] {
  const fields = error.issues.map((issue) =>
    issue.path
      .map((key, index) =>
        typeof key === "number" ? `[${key}]` : `${index === 0 ? "" : "."}${String(key)}`,
      )
      .join(""),
  )
  return [...new Set(fields.map((field) => field || "the row"))]
}

export function readSnapshot(file: unknown): Snapshot {
  const parsed = snapshotFile.safeParse(file)
  if (!parsed.success) {
    throw new SnapshotInvalid("The snapshot is not a split:fetch file (no group or expense pages)")
  }
  const group = groupBody.safeParse(parsed.data.group)
  if (!group.success) {
    throw new SnapshotInvalid(
      `The snapshot's group is not in the expected shape: ${fieldsOf(group.error).join(", ")}`,
    )
  }

  const raw = parsed.data.expensePages.flatMap((page, index) => {
    const rows = expenseRows(page)
    if (rows === undefined) {
      throw new SnapshotInvalid(`Expense page ${index + 1} of the snapshot has no expenses list`)
    }
    return rows
  })

  const snapshot: Snapshot = {
    rowsRead: raw.length,
    deleted: 0,
    rows: [],
    malformed: [],
    members: group.data.group.members.map((member) => ({
      userId: member.id,
      balance: member.balance.map((entry) => ({
        currency: entry.currency_code,
        amount: entry.amount,
      })),
    })),
  }
  raw.forEach((value, index) => {
    const row = index + 1
    const deleted = deletedAt.safeParse(value)
    if (deleted.success && deleted.data.deleted_at) {
      snapshot.deleted += 1
      return
    }
    const parsedRow = expenseRow.safeParse(value)
    if (!deleted.success || !parsedRow.success) {
      const fields = [
        ...(deleted.success ? [] : fieldsOf(deleted.error)),
        ...(parsedRow.success ? [] : fieldsOf(parsedRow.error)),
      ]
      snapshot.malformed.push({ row, fields })
      return
    }
    const data = parsedRow.data
    snapshot.rows.push({
      row,
      payment: data.payment,
      cost: data.cost,
      currency: data.currency_code,
      date: data.date,
      createdAt: data.created_at ?? null,
      updatedAt: data.updated_at ?? null,
      description: data.description ?? "",
      details: data.details ?? "",
      category: data.category?.name ?? null,
      users: data.users.map((user) => ({
        userId: user.user_id,
        paidShare: user.paid_share,
        owedShare: user.owed_share,
      })),
    })
  })
  return snapshot
}

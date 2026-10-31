/**
 * Split's rules, the same on client and server: how one side of an Expense turns into cents, what
 * blocks an Expense from being saved, and how entries move each Member's Balance.
 *
 * Every function that hands out cents takes the Members oldest Account first (`order`): leftover
 * cents go by the largest remainder, then to the oldest Account, so the same Expense always
 * resolves to the same shares.
 */
import { allocate } from "../money.ts"
import { isoDate } from "../schemas/primitives.ts"
import type { Shares, Side } from "./schemas.ts"

/** One side resolved: the cents per Member, or what still blocks it. Both have a short status. */
export type SideResolution =
  { ok: true; shares: Shares; status: string } | { ok: false; problem: string; status: string }

/** An Equal side with these Members ticked and nothing typed for the other modes. */
export function equalSide(ticked: readonly string[]): Side {
  return { mode: "equal", ticked: [...ticked], exact: {}, percent: {} }
}

function refused(problem: string): SideResolution {
  return { ok: false, problem, status: problem }
}

/** Keeps only the nonzero shares: a Member whose share rounds to nothing has none. */
function nonzero(ids: readonly string[], cents: readonly number[]): Shares {
  const result: Shares = {}
  ids.forEach((member, index) => {
    const part = cents[index] ?? 0
    if (part !== 0) result[member] = part
  })
  return result
}

/**
 * The cents per Member for one side of an Expense of `total`, `order` being every Member who may
 * be on it, oldest Account first. Equal splits the total among the Members ticked.
 */
export function resolveSide(total: number, side: Side, order: readonly string[]): SideResolution {
  const ticked = new Set(side.ticked)
  if (ticked.size === 0) return refused("Tick at least one Member")
  const known = new Set(order)
  if ([...ticked].some((member) => !known.has(member))) {
    return refused("Only Members can be on an Expense")
  }
  const ids = order.filter((member) => ticked.has(member))
  const shares = nonzero(
    ids,
    allocate(
      total,
      ids.map(() => 1),
    ),
  )
  return { ok: true, shares, status: ids.length === 1 ? "1 person" : `${ids.length} ways` }
}

/** What identifies an Expense and how it is split; the rest is stored as given. */
export type ExpenseInput = {
  description: string
  date: string
  total: number
  paid: Side
  owed: Side
}

/** The fields of an Expense that can block its save, as the API's validation names them. */
export type ExpenseField = "description" | "date" | "total" | "paid" | "owed"
export type ExpenseProblem = { field: ExpenseField; message: string }

export type ExpenseResolution =
  { ok: true; paidShares: Shares; owedShares: Shares } | { ok: false; problems: ExpenseProblem[] }

/**
 * An Expense's Paid and Owed shares, or every problem blocking its save, in the order the form
 * asks for the fields. `order` is every Member who may be on it, oldest Account first.
 */
export function resolveExpense(expense: ExpenseInput, order: readonly string[]): ExpenseResolution {
  const problems: ExpenseProblem[] = []
  if (expense.description.trim() === "") {
    problems.push({ field: "description", message: "Add a description" })
  }
  if (!isoDate.safeParse(expense.date).success) {
    problems.push({ field: "date", message: "Pick a date" })
  }
  const total = Number.isSafeInteger(expense.total) ? expense.total : 0
  if (total === 0) problems.push({ field: "total", message: "Enter a total other than zero" })
  const paid = resolveSide(total, expense.paid, order)
  const owed = resolveSide(total, expense.owed, order)
  if (!paid.ok) problems.push({ field: "paid", message: paid.problem })
  if (!owed.ok) problems.push({ field: "owed", message: owed.problem })
  if (problems.length > 0 || !paid.ok || !owed.ok) return { ok: false, problems }
  return { ok: true, paidShares: paid.shares, owedShares: owed.shares }
}

/** What moves Balances: an Expense's stored shares. */
export type BalanceEntry = { paidShares: Shares; owedShares: Shares }

/** How one entry moves each Member's Balance: their Paid share less their Owed share. */
export function effect(entry: BalanceEntry): Shares {
  const moves: Shares = {}
  const add = (member: string, cents: number) => {
    moves[member] = (moves[member] ?? 0) + cents
  }
  for (const [member, cents] of Object.entries(entry.paidShares)) add(member, cents)
  for (const [member, cents] of Object.entries(entry.owedShares)) add(member, -cents)
  for (const [member, cents] of Object.entries(moves)) if (cents === 0) delete moves[member]
  return moves
}

/** How one entry moves one Member's Balance; zero when it doesn't involve them. */
export function effectOn(entry: BalanceEntry, member: string): number {
  return effect(entry)[member] ?? 0
}

/**
 * Every Member's Balance from every entry: positive when the others owe them, negative when they
 * owe. Each of `members` gets one, zero when untouched. They always add up to zero.
 */
export function balances(entries: Iterable<BalanceEntry>, members: readonly string[] = []): Shares {
  const totals: Shares = Object.fromEntries(members.map((member) => [member, 0]))
  for (const entry of entries) {
    for (const [member, cents] of Object.entries(effect(entry))) {
      totals[member] = (totals[member] ?? 0) + cents
    }
  }
  return totals
}

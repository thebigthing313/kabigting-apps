/**
 * Split's rules, the same on client and server: how one side of an Expense turns into cents, what
 * blocks an Expense from being saved, and how entries move each Member's Balance.
 *
 * Every function that hands out cents takes a `Roster`: leftover cents go by the largest remainder,
 * then to the oldest Account in its `order`, so the same Expense always resolves to the same shares.
 */
import { allocate, format } from "../money.ts"
import { isoDate } from "../schemas/primitives.ts"
import type { Shares, Side } from "./schemas.ts"

/** One side resolved: the cents per Member, or what still blocks it. Both have a short status. */
export type SideResolution =
  { ok: true; shares: Shares; status: string } | { ok: false; problem: string; status: string }

/** An Equal side with these Members ticked and nothing typed for the other modes. */
export function equalSide(ticked: readonly string[]): Side {
  return { mode: "equal", ticked: [...ticked], exact: {}, percent: {} }
}

/** Who an Expense's cents can go to. */
export type Roster = {
  /**
   * Every Account that may hold a share, oldest Account first: the order leftover cents follow.
   * The current Members, plus, when editing, anyone already on the Expense.
   */
  order: readonly string[]
  /**
   * Who may be on the Expense: the current Members, plus, when editing, anyone already on it.
   * Anyone else ticked is refused. Everyone here is in `order`.
   */
  allowed: ReadonlySet<string>
}

/** The Roster of a new Expense: only the current Members, oldest Account first. */
export function newExpenseRoster(memberIds: readonly string[]): Roster {
  return { order: memberIds, allowed: new Set(memberIds) }
}

/** What shows who is already on a saved Expense: its sides as entered and its stored shares. */
export type SavedSides = { paid: Side; owed: Side; paidShares: Shares; owedShares: Shares }

/**
 * Everyone already on a saved Expense: holding a share, or ticked on a side even when their share
 * rounded to nothing.
 */
export function accountsOnExpense(saved: SavedSides): Set<string> {
  return new Set([
    ...Object.keys(saved.paidShares),
    ...Object.keys(saved.owedShares),
    ...saved.paid.ticked,
    ...saved.owed.ticked,
  ])
}

/**
 * The Roster of an Expense being edited: the current Members, plus everyone already on it, Former
 * members included. Nobody else can be added. `oldestFirst` ranks Accounts by
 * age; anyone it doesn't know goes last.
 */
export function editExpenseRoster(
  oldestFirst: readonly string[],
  memberIds: readonly string[],
  saved: SavedSides,
): Roster {
  const allowed = new Set([...memberIds, ...accountsOnExpense(saved)])
  const rank = (id: string) => {
    const at = oldestFirst.indexOf(id)
    return at === -1 ? oldestFirst.length : at
  }
  return { order: [...allowed].toSorted((a, b) => rank(a) - rank(b)), allowed }
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

const OUTSIDER = "Only Members can be on an Expense"

/** "1 Member", "3 ways": how many share a side that balances. */
function ways(count: number): string {
  return count === 1 ? "1 Member" : `${count} ways`
}

/**
 * The cents per Member for one side of an Expense of `total`, by the side's Split mode. Equal
 * splits the total among the Members ticked; Percent takes each Member's percent of it; both hand
 * leftover cents out by the largest remainder, then in `roster.order`. Exact takes the amounts
 * typed, which must add up to the total's amount, and gives them the total's sign.
 */
export function resolveSide(total: number, side: Side, roster: Roster): SideResolution {
  if (side.mode === "exact") return exactShares(total, side.exact, roster)
  if (side.mode === "percent") return percentShares(total, side.percent, roster)
  const ticked = new Set(side.ticked)
  if (ticked.size === 0) return refused("Tick at least one Member")
  if ([...ticked].some((member) => !roster.allowed.has(member))) return refused(OUTSIDER)
  const ids = roster.order.filter((member) => ticked.has(member))
  const shares = nonzero(
    ids,
    allocate(
      total,
      ids.map(() => 1),
    ),
  )
  return { ok: true, shares, status: ways(ids.length) }
}

/**
 * Exact inputs are amounts as typed, never negative, for a cost and a Refund alike: on a Refund,
 * 10.00 typed is a share of -$10.00. The shares take the total's sign here, so the inputs stay as
 * typed and reopen as typed, and the tally compares amounts without signs. A negative input is
 * refused rather than read as its amount, so a stray minus is never silently dropped.
 */
function exactShares(total: number, exact: Side["exact"], roster: Roster): SideResolution {
  // A blank or zero entry is no share.
  const typed = new Map<string, number>()
  for (const [member, cents] of Object.entries(exact)) {
    if (cents !== null && cents !== 0) typed.set(member, cents)
  }
  if ([...typed.keys()].some((member) => !roster.allowed.has(member))) return refused(OUTSIDER)
  if ([...typed.values()].some((cents) => cents < 0)) {
    return refused("Enter each amount without a minus sign")
  }
  const sum = [...typed.values()].reduce((a, b) => a + b, 0)
  if (!Number.isSafeInteger(sum)) return refused("The shares are too large")
  const left = Math.abs(total) - sum
  if (left !== 0) {
    return refused(`${format(Math.abs(left))} ${left > 0 ? "left to assign" : "over"}`)
  }
  const sign = total < 0 ? -1 : 1
  const ids = roster.order.filter((member) => typed.has(member))
  return {
    ok: true,
    shares: nonzero(
      ids,
      ids.map((member) => sign * (typed.get(member) ?? 0)),
    ),
    status: ways(ids.length),
  }
}

// Up to three digits, then up to two decimals, then an optional "%".
const PERCENT = /^(\d{1,3})?(?:\.(\d{0,2}))?%?$/

/**
 * A percent as typed ("33.33", "4.5", "12%") in hundredths of a percent, or null when it isn't a
 * plain number with up to two decimals.
 */
export function parsePercent(text: string): number | null {
  const match = PERCENT.exec(text.trim())
  if (!match) return null
  const [, whole, fraction] = match
  if (whole === undefined && !fraction) return null
  return Number(whole ?? "0") * 100 + Number((fraction ?? "").padEnd(2, "0"))
}

/** Hundredths of a percent in words, without trailing zeros: 450 → "4.5%". */
function percentWords(hundredths: number): string {
  return `${(hundredths / 100).toFixed(2).replace(/\.?0+$/, "")}%`
}

function percentShares(total: number, percents: Side["percent"], roster: Roster): SideResolution {
  const points = new Map<string, number>()
  for (const [member, text] of Object.entries(percents)) {
    if (text.trim() === "") continue
    const parsed = parsePercent(text)
    if (parsed === null) return refused("Enter each percent with up to two decimals")
    // A zero percent is no share.
    if (parsed > 0) points.set(member, parsed)
  }
  if ([...points.keys()].some((member) => !roster.allowed.has(member))) return refused(OUTSIDER)
  const left = 10_000 - [...points.values()].reduce((a, b) => a + b, 0)
  if (left !== 0) {
    return refused(`${percentWords(Math.abs(left))} ${left > 0 ? "left to assign" : "over"}`)
  }
  const ids = roster.order.filter((member) => points.has(member))
  return {
    ok: true,
    shares: nonzero(
      ids,
      allocate(
        total,
        ids.map((member) => points.get(member) ?? 0),
      ),
    ),
    status: ways(ids.length),
  }
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
 * asks for the fields.
 */
export function resolveExpense(expense: ExpenseInput, roster: Roster): ExpenseResolution {
  const problems: ExpenseProblem[] = []
  if (expense.description.trim() === "") {
    problems.push({ field: "description", message: "Add a description" })
  }
  if (!isoDate.safeParse(expense.date).success) {
    problems.push({ field: "date", message: "Pick a date" })
  }
  const total = Number.isSafeInteger(expense.total) ? expense.total : 0
  if (total === 0) problems.push({ field: "total", message: "Enter a total other than zero" })
  const paid = resolveSide(total, expense.paid, roster)
  const owed = resolveSide(total, expense.owed, roster)
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

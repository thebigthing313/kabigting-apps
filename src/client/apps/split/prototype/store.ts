// PROTOTYPE, throwaway: an in-memory stand-in for the Split data layer, for the UI prototype only.
// Nothing here talks to the server; reloading the page resets every Expense and Payment.
import { useState } from "react"
import { allocate, format } from "@shared/money"

export type Member = { id: string; name: string; former?: boolean }
export type Mode = "equal" | "exact" | "percent"
export const MODES: readonly Mode[] = ["equal", "exact", "percent"]

/** One side of an Expense as entered: the mode and the inputs of every mode, so switching keeps them. */
export type Side = {
  mode: Mode
  ticked: string[]
  exact: Record<string, number | null>
  /** Percent as typed, up to two decimals. */
  percent: Record<string, string>
}

export type Expense = {
  kind: "expense"
  id: string
  description: string
  date: string
  categoryId: string
  total: number
  note: string
  paid: Side
  owed: Side
  paidShares: Record<string, number>
  owedShares: Record<string, number>
  addedBy: string
  changedBy: string
}

export type Payment = {
  kind: "payment"
  id: string
  date: string
  fromId: string
  toId: string
  amount: number
  note: string
  addedBy: string
  changedBy: string
}

export type Entry = Expense | Payment

// Oldest Account first: the order leftover cents are handed out in.
export const MEMBERS: Member[] = [
  { id: "sam", name: "Sam" },
  { id: "alex", name: "Alex" },
  { id: "jordan", name: "Jordan" },
  { id: "riley", name: "Riley", former: true },
]
export const CURRENT = MEMBERS.filter((member) => !member.former)

export const CATEGORIES = [
  { id: "general", name: "General" },
  { id: "groceries", name: "Groceries" },
  { id: "dining", name: "Dining out" },
  { id: "utilities", name: "Utilities" },
  { id: "rent", name: "Rent" },
  { id: "household", name: "Household supplies" },
  { id: "transport", name: "Transport" },
  { id: "travel", name: "Travel" },
  { id: "entertainment", name: "Entertainment" },
  { id: "health", name: "Health" },
  { id: "gifts", name: "Gifts" },
  { id: "other", name: "Other" },
]

export function memberName(id: string): string {
  return MEMBERS.find((member) => member.id === id)?.name ?? id
}
export function categoryName(id: string): string {
  return CATEGORIES.find((category) => category.id === id)?.name ?? id
}

export function emptySide(mode: Mode, ticked: string[]): Side {
  return { mode, ticked, exact: {}, percent: {} }
}

/** Percent typed as "33.33" → 3333 hundredths of a percent; null when not a valid percent. */
export function parsePercent(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim())
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"))
}

function pct(hundredths: number): string {
  return `${(Math.abs(hundredths) / 100).toFixed(2).replace(/.?0+$/, "")}%`
}

export type SideResult = {
  /** Cents per Member; a live preview while the side is not yet valid. */
  shares: Record<string, number>
  /** What still blocks a save, in words; null when the side sums to the total. */
  problem: string | null
  /** A short live status: "$12.00 left to assign", "4.5% over", "3 ways". */
  status: string
  ok: boolean
}

/** Turns one side's inputs into cents, the way #152 pins it. `order` is every Member on the form. */
export function resolveSide(total: number | null, side: Side, order: string[]): SideResult {
  const amount = total ?? 0
  if (side.mode === "exact") {
    const shares: Record<string, number> = {}
    let sum = 0
    for (const id of order) {
      const cents = side.exact[id] ?? 0
      if (cents !== 0) shares[id] = cents
      sum += cents
    }
    const left = amount - sum
    const status =
      left === 0
        ? "All assigned"
        : Math.sign(left) === Math.sign(amount) || amount === 0
          ? `${format(Math.abs(left))} left to assign`
          : `${format(Math.abs(left))} over`
    return { shares, problem: left === 0 ? null : status, status, ok: left === 0 && amount !== 0 }
  }
  if (side.mode === "percent") {
    const ids = order.filter((id) => (parsePercent(side.percent[id] ?? "") ?? 0) > 0)
    const points = ids.map((id) => parsePercent(side.percent[id] ?? "") ?? 0)
    const sum = points.reduce((a, b) => a + b, 0)
    const bad = order.some((id) => {
      const text = side.percent[id] ?? ""
      return text.trim() !== "" && parsePercent(text) === null
    })
    const shares: Record<string, number> = {}
    if (sum > 0 && amount !== 0) {
      // A preview against the percents typed so far; only exact at 100%.
      const parts = allocate(Math.round((amount * sum) / 10000), points)
      ids.forEach((id, index) => (shares[id] = parts[index]!))
    }
    const left = 10000 - sum
    const status = bad
      ? "A percent isn't valid"
      : left === 0
        ? "100%"
        : left > 0
          ? `${pct(left)} left to assign`
          : `${pct(left)} over`
    return {
      shares,
      problem: bad || left !== 0 ? status : null,
      status,
      ok: !bad && left === 0 && amount !== 0,
    }
  }
  const ids = order.filter((id) => side.ticked.includes(id))
  const shares: Record<string, number> = {}
  if (ids.length > 0 && amount !== 0) {
    const parts = allocate(
      amount,
      ids.map(() => 1),
    )
    ids.forEach((id, index) => (shares[id] = parts[index]!))
  }
  const problem = ids.length === 0 ? "Tick at least one Member" : null
  const status = ids.length === 0 ? problem! : ids.length === 1 ? "1 person" : `${ids.length} ways`
  return { shares, problem, status, ok: problem === null && amount !== 0 }
}

/** Plain-words summary of a side, used in lists and the review step. */
export function describeShares(shares: Record<string, number>): string {
  const entries = Object.entries(shares).filter(([, cents]) => cents !== 0)
  if (entries.length === 0) return "nobody"
  const values = new Set(entries.map(([, cents]) => cents))
  if (entries.length > 1 && values.size === 1)
    return `${entries.map(([id]) => memberName(id)).join(", ")} (${format(entries[0]![1])} each)`
  return entries.map(([id, cents]) => `${memberName(id)} ${format(cents)}`).join(", ")
}

/** How one Entry moves each Member's Balance. */
export function effect(entry: Entry): Record<string, number> {
  const moves: Record<string, number> = {}
  const add = (id: string, cents: number) => (moves[id] = (moves[id] ?? 0) + cents)
  if (entry.kind === "payment") {
    add(entry.fromId, entry.amount)
    add(entry.toId, -entry.amount)
  } else {
    for (const [id, cents] of Object.entries(entry.paidShares)) add(id, cents)
    for (const [id, cents] of Object.entries(entry.owedShares)) add(id, -cents)
  }
  return moves
}

export function balances(entries: Entry[]): Record<string, number> {
  const totals: Record<string, number> = Object.fromEntries(MEMBERS.map((m) => [m.id, 0]))
  for (const entry of entries)
    for (const [id, cents] of Object.entries(effect(entry))) totals[id] = (totals[id] ?? 0) + cents
  return totals
}

/** The Members a form offers: everyone current, plus any Former member already on this Expense. */
export function formMembers(expense: Expense | null): string[] {
  const onIt = expense
    ? new Set([...Object.keys(expense.paidShares), ...Object.keys(expense.owedShares)])
    : new Set<string>()
  return MEMBERS.filter((m) => !m.former || onIt.has(m.id)).map((m) => m.id)
}

let nextId = 100
const newId = () => String(nextId++)

function seedExpense(
  description: string,
  date: string,
  categoryId: string,
  total: number,
  paid: Side,
  owed: Side,
  by: string,
  note = "",
): Expense {
  const order = MEMBERS.map((m) => m.id)
  return {
    kind: "expense",
    id: newId(),
    description,
    date,
    categoryId,
    total,
    note,
    paid,
    owed,
    paidShares: resolveSide(total, paid, order).shares,
    owedShares: resolveSide(total, owed, order).shares,
    addedBy: by,
    changedBy: by,
  }
}

const everyone = ["sam", "alex", "jordan"]

const RECENT: Entry[] = [
  seedExpense(
    "Costco run",
    "2026-10-29",
    "groceries",
    18_743,
    emptySide("equal", ["sam"]),
    emptySide("equal", everyone),
    "sam",
  ),
  {
    kind: "payment",
    id: newId(),
    date: "2026-10-27",
    fromId: "jordan",
    toId: "sam",
    amount: 6000,
    note: "",
    addedBy: "jordan",
    changedBy: "jordan",
  },
  seedExpense(
    "Electric bill",
    "2026-10-20",
    "utilities",
    14_210,
    { mode: "exact", ticked: [], exact: { sam: 10_000, alex: 4210 }, percent: {} },
    { mode: "percent", ticked: [], exact: {}, percent: { sam: "40", alex: "30", jordan: "30" } },
    "alex",
    "Alex covered the late fee",
  ),
  seedExpense(
    "Pizza night",
    "2026-10-17",
    "dining",
    5400,
    emptySide("equal", ["jordan"]),
    emptySide("equal", ["sam", "alex", "jordan"]),
    "jordan",
  ),
  seedExpense(
    "Returned lamp",
    "2026-10-12",
    "household",
    -3999,
    emptySide("equal", ["alex"]),
    emptySide("equal", ["alex", "sam"]),
    "alex",
  ),
  {
    kind: "payment",
    id: newId(),
    date: "2026-10-05",
    fromId: "sam",
    toId: "riley",
    amount: 2500,
    note: "Settling Riley's last share",
    addedBy: "sam",
    changedBy: "sam",
  },
  seedExpense(
    "Moving truck",
    "2026-09-28",
    "transport",
    12_000,
    emptySide("equal", ["riley"]),
    emptySide("equal", ["sam", "alex", "jordan", "riley"]),
    "riley",
  ),
]

// A year of made-up history before October, so the summaries have periods to compare. Riley
// lived in until the end of September and is a Former member after that.
function history(): Entry[] {
  const out: Entry[] = []
  const four = ["sam", "alex", "jordan", "riley"]
  const months = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05"]
  months.push("2026-06", "2026-07", "2026-08", "2026-09")
  months.forEach((month, i) => {
    const payer = four[i % 4]!
    const wobble = (n: number) => ((i * 37 + n * 53) % 41) * 100
    out.push(
      seedExpense(
        "Groceries",
        `${month}-04`,
        "groceries",
        9_000 + wobble(1),
        emptySide("equal", [payer]),
        emptySide("equal", four),
        payer,
      ),
      seedExpense(
        "Groceries",
        `${month}-18`,
        "groceries",
        7_500 + wobble(2),
        emptySide("equal", ["sam"]),
        emptySide("equal", four),
        "sam",
      ),
      seedExpense(
        "Internet",
        `${month}-10`,
        "utilities",
        7_999,
        emptySide("equal", ["alex"]),
        emptySide("equal", four),
        "alex",
      ),
      seedExpense(
        "Electric bill",
        `${month}-21`,
        "utilities",
        9_000 + wobble(3) * 2,
        emptySide("equal", ["jordan"]),
        emptySide("equal", four),
        "jordan",
      ),
      seedExpense(
        "Takeout",
        `${month}-13`,
        "dining",
        3_000 + wobble(4),
        emptySide("equal", [four[(i + 1) % 4]!]),
        emptySide("equal", ["sam", "alex", "jordan"]),
        "sam",
      ),
    )
    if (i % 3 === 0)
      out.push(
        seedExpense(
          "Cleaning supplies",
          `${month}-08`,
          "household",
          2_400 + wobble(5),
          emptySide("equal", ["riley"]),
          emptySide("equal", four),
          "riley",
        ),
      )
    if (i % 4 === 1)
      out.push(
        seedExpense(
          "Concert tickets",
          `${month}-25`,
          "entertainment",
          18_000,
          emptySide("equal", ["alex"]),
          emptySide("equal", ["alex", "jordan"]),
          "alex",
        ),
      )
    if (i % 2 === 0)
      out.push({
        kind: "payment",
        id: newId(),
        date: `${month}-28`,
        fromId: four[(i + 2) % 4]!,
        toId: "sam",
        amount: 5_000 + wobble(6),
        note: "",
        addedBy: "sam",
        changedBy: "sam",
      })
  })
  out.push(
    seedExpense(
      "Beach house",
      "2026-07-02",
      "travel",
      96_000,
      { mode: "exact", ticked: [], exact: { sam: 60_000, jordan: 36_000 }, percent: {} },
      emptySide("equal", four),
      "sam",
    ),
    seedExpense(
      "Pharmacy",
      "2026-03-15",
      "health",
      2_350,
      emptySide("equal", ["jordan"]),
      emptySide("equal", ["jordan"]),
      "jordan",
      "Only Jordan's, logged for the record",
    ),
    seedExpense(
      "Birthday gift for Mom",
      "2026-05-09",
      "gifts",
      7_500,
      emptySide("equal", ["alex"]),
      emptySide("equal", ["sam", "alex", "jordan"]),
      "alex",
    ),
  )
  return out
}

const SEED: Entry[] = [...RECENT, ...history()]

export type Store = ReturnType<typeof useSplitStore>

export function useSplitStore(viewerId: string) {
  const [entries, setEntries] = useState<Entry[]>(SEED)
  const sorted = entries.toSorted((a, b) => b.date.localeCompare(a.date))
  return {
    viewerId,
    entries: sorted,
    balances: balances(entries),
    saveExpense(draft: Omit<Expense, "kind" | "id" | "addedBy" | "changedBy">, id: string | null) {
      setEntries((prev) =>
        id === null
          ? [
              ...prev,
              { ...draft, kind: "expense", id: newId(), addedBy: viewerId, changedBy: viewerId },
            ]
          : prev.map((e) =>
              e.id === id && e.kind === "expense" ? { ...e, ...draft, changedBy: viewerId } : e,
            ),
      )
    },
    savePayment(draft: Omit<Payment, "kind" | "id" | "addedBy" | "changedBy">, id: string | null) {
      setEntries((prev) =>
        id === null
          ? [
              ...prev,
              { ...draft, kind: "payment", id: newId(), addedBy: viewerId, changedBy: viewerId },
            ]
          : prev.map((e) =>
              e.id === id && e.kind === "payment" ? { ...e, ...draft, changedBy: viewerId } : e,
            ),
      )
    },
    remove(id: string) {
      setEntries((prev) => prev.filter((e) => e.id !== id))
    },
  }
}

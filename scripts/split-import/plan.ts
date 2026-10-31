/**
 * Maps the Splitwise snapshot onto Split (decision #156) without touching the database: each live
 * expense row becomes an Expense with both sides in exact dollars, each payment row a Payment, and
 * every Member's computed Balance is checked against Splitwise's own. Any failure is listed and
 * the run writes nothing. Failures name a row by its number and the field at fault, and a Member
 * by their number in the mapping, never by a value.
 */
import { z } from "zod"
import { dateOfInstant } from "#shared/dates.ts"
import { parseToCent } from "#shared/money.ts"
import { householdBalances, resolveExpense, type Roster } from "#shared/split/rules.ts"
import type { Shares, Side } from "#shared/split/schemas.ts"
import { mapCategory } from "./categories.ts"
import type { MappingEntry } from "./mapping.ts"
import { readSnapshot, type SplitwiseRow } from "./snapshot.ts"

/** An Account a mapping entry may name, oldest Account first; `access` is App access to Split. */
export type ImportAccount = { id: string; email: string; access: boolean }

type CategoryName = NonNullable<ReturnType<typeof mapCategory>>

export type PlannedExpense = {
  row: number
  date: string
  description: string
  note: string
  category: CategoryName
  /** Cents: positive for a cost, negative for a Refund. */
  total: number
  paid: Side
  owed: Side
  paidShares: Shares
  owedShares: Shares
}

export type PlannedPayment = {
  row: number
  date: string
  fromId: string
  toId: string
  amount: number
}

/** One mapped Member, by number: App access, and both Balances in cents (null when unknown). */
export type MemberCheck = {
  number: number
  access: boolean | null
  computed: number | null
  splitwise: number | null
}

export type YearCounts = { expenses: number; refunds: number; payments: number }
export type CategoryYear = { year: string; category: CategoryName; count: number; total: number }

export type ImportPlan = {
  expenses: PlannedExpense[]
  payments: PlannedPayment[]
  report: {
    rowsRead: number
    deleted: number
    years: Map<string, YearCounts>
    categories: CategoryYear[]
    members: MemberCheck[]
    failures: string[]
  }
}

/** Splitwise sends Description and note lengths the Split form would refuse to save. */
const DESCRIPTION_MAX = 200
const NOTE_MAX = 2_000
const instant = z.iso.datetime({ offset: true })

/** Exact cents from a Splitwise decimal string, or null when malformed or finer than a cent. */
function exactCents(amount: string): number | null {
  const parsed = parseToCent(amount)
  return parsed === null || parsed.rounded ? null : parsed.cents
}

/** A side in exact dollars: the amounts as typed, never negative, as the form stores them. */
function exactSide(shares: Shares): Side {
  return {
    mode: "exact",
    ticked: Object.keys(shares),
    exact: Object.fromEntries(Object.entries(shares).map(([id, cents]) => [id, Math.abs(cents)])),
    percent: {},
  }
}

function sum(shares: Shares): number {
  return Object.values(shares).reduce((a, b) => a + b, 0)
}

type Mapped = {
  /** Splitwise user id → Account id, for mapping entries naming a known Account. */
  accountOf: Map<string, string>
  roster: Roster
  failures: string[]
}

/**
 * Resolves each mapping entry to its Account. Fails on an email no Account has, or two entries
 * naming one Account. The Roster lists every mapped Account, oldest first, Members or not: the
 * import never grants access, so one without it lands as a Former member.
 */
function resolveMapping(mapping: readonly MappingEntry[], accounts: readonly ImportAccount[]) {
  const byEmail = new Map(accounts.map((account) => [account.email.toLowerCase(), account]))
  const entryOf = new Map<string, number>()
  const mapped: Mapped = {
    accountOf: new Map(),
    roster: { order: [], allowed: new Set() },
    failures: [],
  }
  for (const entry of mapping) {
    const account = byEmail.get(entry.email)
    if (account === undefined) {
      mapped.failures.push(`Mapping entry ${entry.number}: no Account has that email`)
      continue
    }
    const earlier = entryOf.get(account.id)
    if (earlier !== undefined) {
      mapped.failures.push(`Mapping entries ${earlier} and ${entry.number} map to the same Account`)
      continue
    }
    entryOf.set(account.id, entry.number)
    mapped.accountOf.set(entry.splitwiseId, account.id)
  }
  const ids = new Set(mapped.accountOf.values())
  const order = accounts.map((account) => account.id).filter((id) => ids.has(id))
  mapped.roster = { order, allowed: ids }
  return mapped
}

type RowResult = { expense: PlannedExpense } | { payment: PlannedPayment } | { failures: string[] }

function planRow(row: SplitwiseRow, mapped: Mapped): RowResult {
  const failures: string[] = []
  const fail = (field: string, message: string) =>
    failures.push(`Row ${row.row}: ${field} ${message}`)

  if (row.currency !== "USD") fail("currency_code", "is not USD")
  const cost = exactCents(row.cost)
  if (cost === null) fail("cost", "is not exact to the cent")
  else if (cost === 0) fail("cost", "is zero")
  const date = instant.safeParse(row.date).success ? dateOfInstant(row.date) : null
  if (date === null) fail("date", "is not a UTC instant")

  const paid: Shares = {}
  const owed: Shares = {}
  const seen = new Set<string>()
  row.users.forEach((user, index) => {
    const at = `users[${index}]`
    const accountId = mapped.accountOf.get(user.userId)
    if (accountId === undefined) {
      fail(`${at}.user_id`, "is not in the mapping")
      return
    }
    if (seen.has(accountId)) {
      fail(`${at}.user_id`, "is on the row twice")
      return
    }
    seen.add(accountId)
    for (const [field, amount, side] of [
      ["paid_share", user.paidShare, paid],
      ["owed_share", user.owedShare, owed],
    ] as const) {
      const cents = exactCents(amount)
      if (cents === null) fail(`${at}.${field}`, "is not exact to the cent")
      else if (cost !== null && cents !== 0 && Math.sign(cents) !== Math.sign(cost)) {
        fail(`${at}.${field}`, "has the opposite sign to cost")
      } else if (cents !== 0) side[accountId] = cents
    }
  })
  if (cost !== null && failures.length === 0) {
    if (sum(paid) !== cost) fail("paid_share", "does not add up to cost")
    if (sum(owed) !== cost) fail("owed_share", "does not add up to cost")
  }
  if (failures.length > 0 || cost === null || date === null) return { failures }

  if (row.payment) return planPayment(row, date, paid, owed)

  const category = row.category === null ? null : mapCategory(row.category)
  if (category === null) fail("category.name", "is not in the Category mapping")
  const description = row.description.trim()
  if (description === "") fail("description", "is empty")
  if (description.length > DESCRIPTION_MAX) {
    fail("description", `is over ${DESCRIPTION_MAX} characters`)
  }
  const note = row.details.trim()
  if (note.length > NOTE_MAX) fail("details", "is over 2,000 characters")
  if (failures.length > 0 || category === null) return { failures }

  const sides = { paid: exactSide(paid), owed: exactSide(owed) }
  const resolved = resolveExpense({ description, date, total: cost, ...sides }, mapped.roster)
  if (!resolved.ok) {
    return {
      failures: resolved.problems.map(
        (problem) => `Row ${row.row}: ${problem.field} does not resolve`,
      ),
    }
  }
  return {
    expense: {
      row: row.row,
      date,
      description,
      note,
      category,
      total: cost,
      ...sides,
      paidShares: resolved.paidShares,
      owedShares: resolved.owedShares,
    },
  }
}

/**
 * A payment row moves exactly two members by equal and opposite amounts. It becomes a Payment from
 * the one whose Balance went up to the one whose Balance went down, with no note.
 */
function planPayment(row: SplitwiseRow, date: string, paid: Shares, owed: Shares): RowResult {
  const moves = new Map<string, number>()
  for (const [id, cents] of Object.entries(paid)) moves.set(id, (moves.get(id) ?? 0) + cents)
  for (const [id, cents] of Object.entries(owed)) moves.set(id, (moves.get(id) ?? 0) - cents)
  const touched = [...moves].filter(([, cents]) => cents !== 0)
  const up = touched.find(([, cents]) => cents > 0)
  const down = touched.find(([, cents]) => cents < 0)
  if (touched.length !== 2 || !up || !down || up[1] !== -down[1]) {
    return {
      failures: [
        `Row ${row.row}: users does not move exactly two members by equal and opposite amounts`,
      ],
    }
  }
  return { payment: { row: row.row, date, fromId: up[0], toId: down[0], amount: up[1] } }
}

/** A Splitwise group balance list in cents: USD only, exact to the cent, empty meaning zero. */
function splitwiseBalance(
  balance: readonly { currency: string; amount: string }[],
): number | "currency" | "cents" {
  let total = 0
  for (const entry of balance) {
    if (entry.currency !== "USD") return "currency"
    const cents = exactCents(entry.amount)
    if (cents === null) return "cents"
    total += cents
  }
  return total
}

export function planImport(
  snapshotFile: unknown,
  mapping: readonly MappingEntry[],
  accounts: readonly ImportAccount[],
): ImportPlan {
  const snapshot = readSnapshot(snapshotFile)
  const mapped = resolveMapping(mapping, accounts)
  const failures = [...mapped.failures]
  const mappedIds = new Set(mapping.map((entry) => entry.splitwiseId))

  snapshot.members.forEach((member, index) => {
    if (!mappedIds.has(member.userId)) {
      failures.push(`Group member ${index + 1} (in get_group order) is not in the mapping`)
    }
  })
  for (const { row, fields } of snapshot.malformed) {
    failures.push(`Row ${row}: ${fields.join(", ")} missing or not in the expected shape`)
  }

  const expenses: PlannedExpense[] = []
  const payments: PlannedPayment[] = []
  for (const row of snapshot.rows) {
    const result = planRow(row, mapped)
    if ("failures" in result) failures.push(...result.failures)
    else if ("payment" in result) payments.push(result.payment)
    else expenses.push(result.expense)
  }

  const years = new Map<string, YearCounts>()
  const yearOf = (date: string) => {
    const year = date.slice(0, 4)
    const counts = years.get(year) ?? { expenses: 0, refunds: 0, payments: 0 }
    years.set(year, counts)
    return { year, counts }
  }
  const categories = new Map<string, CategoryYear>()
  for (const expense of expenses) {
    const { year, counts } = yearOf(expense.date)
    if (expense.total < 0) counts.refunds += 1
    else counts.expenses += 1
    const key = `${year} ${expense.category}`
    const line = categories.get(key) ?? { year, category: expense.category, count: 0, total: 0 }
    line.count += 1
    line.total += expense.total
    categories.set(key, line)
  }
  for (const payment of payments) yearOf(payment.date).counts.payments += 1

  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const computed = householdBalances(expenses, payments, [...mapped.accountOf.values()])
  const members = mapping.map((entry): MemberCheck => {
    const accountId = mapped.accountOf.get(entry.splitwiseId)
    const account = accountId === undefined ? undefined : accountsById.get(accountId)
    const groupMember = snapshot.members.find((member) => member.userId === entry.splitwiseId)
    // Someone who left the group can only have done so settled up.
    const balance = splitwiseBalance(groupMember?.balance ?? [])
    if (balance === "currency") {
      failures.push(`Member ${entry.number}: the Splitwise balance has a currency other than USD`)
    } else if (balance === "cents") {
      failures.push(`Member ${entry.number}: the Splitwise balance is not exact to the cent`)
    }
    const check: MemberCheck = {
      number: entry.number,
      access: account?.access ?? null,
      computed: accountId === undefined ? null : (computed[accountId] ?? 0),
      splitwise: typeof balance === "number" ? balance : null,
    }
    if (check.computed !== null && check.splitwise !== null && check.computed !== check.splitwise) {
      failures.push(`Member ${entry.number}: the computed Balance differs from Splitwise's`)
    }
    return check
  })

  return {
    expenses,
    payments,
    report: {
      rowsRead: snapshot.rowsRead,
      deleted: snapshot.deleted,
      years,
      categories: [...categories.values()].toSorted(
        (a, b) => a.year.localeCompare(b.year) || a.category.localeCompare(b.category),
      ),
      members,
      failures,
    },
  }
}

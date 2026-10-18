/**
 * The import mapping (spec §8): turns a parsed extract into the rows to write and a counts-only
 * report. Pure: no database and no clock beyond the `today` it is given.
 *
 * Every Actual lands on Checking, the only Wallet. Rows refer to Categories and Accounts by name;
 * the writer gives them ids.
 */
import { CATEGORY_NAMES, mapOldCategory } from "./categories.ts"
import type { Extract, OldTransaction } from "./extract.ts"
import { hasPlausibleYear, kindOf, ref, signed } from "./rows.ts"
import { categoryTotals, type CategoryTotal } from "./totals.ts"

export const CHECKING = "Checking"

/** A payee on at least this many ledger rows becomes an Account. */
export const PAYEE_ACCOUNT_MIN_ROWS = 5

const NOTE_SEPARATOR = " · "

export type PlannedActual = {
  /** `ledger:<id>`, `expense:<id>` or `income:<id>`; the source is always `access`. */
  sourceKey: string
  date: string
  amountCents: number
  /** A new Category's name, or null for Uncategorised. */
  category: string | null
  account: string | null
  note: string
  bankDescription: string | null
}

export type PlannedBalanceCheck = { date: string; amountCents: number }

/** The tables whose rows carry a date and are counted per year. */
export type DatedTable = "transactions" | "ledger" | "balances"
export type YearCounts = { read: number; written: number; skipped: number }

export type ImportReport = {
  /** Per dated table, per year of the row's own date. */
  years: Record<DatedTable, Map<string, YearCounts>>
  /** Rows read from the undated files. */
  undated: { categories: number; schedules: number }
  /** `<table>: <reason>` to a count. */
  skipped: Map<string, number>
  /** Counted, never failing. */
  counted: {
    linkedSumsDiffer: number
    linksToMissingTransactions: number
    dateFromBankDate: number
    dateFromLedgerDate: number
    dateFromTransactionDate: number
    impossibleBankDateFellBack: number
    payeesMovedToNotes: number
    /** Balance entries read whose hand-typed amount went past the cent. */
    balancesRoundedToCent: number
  }
  categoryTotals: CategoryTotal[]
  /** Every reason the run must fail; empty when it may write. */
  failures: string[]
}

export type ImportPlan = {
  wallet: { name: string; inForecast: true }
  categories: readonly string[]
  accounts: string[]
  actuals: PlannedActual[]
  balanceChecks: PlannedBalanceCheck[]
  report: ImportReport
}

function yearOf(date: string | null): string {
  return date === null ? "no date" : date.slice(0, 4)
}

function clean(text: string | null): string | null {
  const trimmed = text?.trim() ?? ""
  return trimmed === "" ? null : trimmed
}

function joinNote(parts: readonly (string | null)[]): string {
  return parts
    .map(clean)
    .filter((part): part is string => part !== null)
    .join(NOTE_SEPARATOR)
}

/** Case-insensitive name registry keeping each name's first spelling. */
class Names {
  private readonly byKey = new Map<string, string>()
  add(name: string): string {
    const key = name.toLowerCase()
    const existing = this.byKey.get(key)
    if (existing !== undefined) return existing
    this.byKey.set(key, name)
    return name
  }
  get(name: string): string | undefined {
    return this.byKey.get(name.toLowerCase())
  }
  values(): string[] {
    return [...this.byKey.values()]
  }
}

export function planImport(extract: Extract, options: { today: string }): ImportPlan {
  const failures: string[] = []
  const skipped = new Map<string, number>()
  const years: ImportReport["years"] = {
    transactions: new Map(),
    ledger: new Map(),
    balances: new Map(),
  }
  const counted: ImportReport["counted"] = {
    linkedSumsDiffer: 0,
    linksToMissingTransactions: 0,
    dateFromBankDate: 0,
    dateFromLedgerDate: 0,
    dateFromTransactionDate: 0,
    impossibleBankDateFellBack: 0,
    payeesMovedToNotes: 0,
    balancesRoundedToCent: extract.balances.filter((row) => row.roundedToCent).length,
  }

  // Read counts come straight from the files; written ones from what the plan holds at the end;
  // skipped ones as rows are dropped. Rows read must equal rows written plus rows skipped.
  function count(table: DatedTable, date: string | null, outcome: keyof YearCounts) {
    const year = yearOf(date)
    const counts = years[table].get(year) ?? { read: 0, written: 0, skipped: 0 }
    counts[outcome] += 1
    years[table].set(year, counts)
  }
  for (const row of extract.transactions) count("transactions", row.date, "read")
  for (const row of extract.ledger) count("ledger", row.date, "read")
  for (const row of extract.balances) count("balances", row.enteredAt.slice(0, 10), "read")
  function skip(table: DatedTable, date: string | null, reason: string) {
    count(table, date, "skipped")
    const label = `${table}: ${reason}`
    skipped.set(label, (skipped.get(label) ?? 0) + 1)
  }

  // Old categories by id, mapped to the new names; unmapped ones fail the run once each.
  const oldCategoryNames = new Map(extract.categories.map((c) => [c.id, c.name]))
  const unmapped = new Set<string>()
  function newCategory(oldId: string | null): string | null {
    if (oldId === null) return null
    const oldName = oldCategoryNames.get(oldId)
    if (oldName === undefined) {
      unmapped.add(`(unknown category id ${oldId})`)
      return null
    }
    const mapped = mapOldCategory(oldName)
    if (mapped === undefined) {
      unmapped.add(oldName.trim())
      return null
    }
    return mapped
  }

  const schedules = new Map(extract.schedules.map((s) => [ref(s.kind, s.id), s]))
  const transactions = new Map(extract.transactions.map((t) => [ref(t.kind, t.id), t]))
  const scheduleName = (row: OldTransaction | undefined): string | null => {
    if (row?.scheduleId == null) return null
    return clean(schedules.get(ref(row.kind, row.scheduleId))?.name ?? null)
  }

  // Ledger rows: one Actual each. The payee threshold counts the rows that come in.
  type Drafted = {
    base: Omit<PlannedActual, "account" | "note">
    /** The source row's own date, for the per-year counts. */
    sourceDate: string | null
    scheduleAccount: string | null
    payee: string | null
    notes: (string | null)[]
  }
  const drafts: Drafted[] = []
  // A transaction any ledger row points to is carried by its ledger rows, even ones skipped
  // later; when those don't add up to it, it is counted under linkedSumsDiffer.
  const linkedLedgerSums = new Map<string, number>()
  for (const row of extract.ledger) {
    if (row.transactionId !== null) linkedLedgerSums.set(ref(kindOf(row), row.transactionId), 0)
  }
  for (const row of extract.ledger) {
    if (row.amountCents === 0) {
      skip("ledger", row.date, "zero amount")
      continue
    }
    const linkRef = row.transactionId === null ? null : ref(kindOf(row), row.transactionId)
    const linked = linkRef === null ? undefined : transactions.get(linkRef)
    if (linkRef !== null && linked === undefined) counted.linksToMissingTransactions += 1

    // The first possible date of the bank date, the row's own and the linked transaction's. An
    // impossible one counts as none; the row drops only when every date it has is impossible.
    const candidates = [row.bankDate, row.date, linked?.date ?? null]
    const chosen = candidates.findIndex((candidate) => hasPlausibleYear(candidate))
    const date = chosen === -1 ? null : (candidates[chosen] ?? null)
    if (date === null) {
      const anyDate = candidates.some((candidate) => candidate !== null)
      skip("ledger", row.date, anyDate ? "impossible date" : "no date")
      continue
    }
    const bankDateImpossible = row.bankDate !== null && chosen > 0
    if (chosen === 0) counted.dateFromBankDate += 1
    else if (chosen === 1) counted.dateFromLedgerDate += 1
    else counted.dateFromTransactionDate += 1
    if (bankDateImpossible) counted.impossibleBankDateFellBack += 1

    const amountCents = signed(kindOf(row), row.amountCents)
    if (linkRef !== null) {
      linkedLedgerSums.set(linkRef, (linkedLedgerSums.get(linkRef) ?? 0) + amountCents)
    }
    drafts.push({
      base: {
        sourceKey: `ledger:${row.id}`,
        date,
        amountCents,
        category: newCategory(row.categoryId),
        bankDescription: clean(row.bankDescription),
      },
      sourceDate: row.date,
      scheduleAccount: scheduleName(linked),
      payee: clean(row.payee),
      notes: [row.note, linked?.note ?? null],
    })
  }

  // Old transactions: carried by their ledger rows when linked, else one Actual each.
  for (const row of extract.transactions) {
    const key = ref(row.kind, row.id)
    const ledgerSum = linkedLedgerSums.get(key)
    if (ledgerSum !== undefined) {
      if (ledgerSum !== signed(row.kind, row.amountCents)) counted.linkedSumsDiffer += 1
      skip("transactions", row.date, "carried by its ledger rows")
      continue
    }
    if (!hasPlausibleYear(row.date)) {
      skip("transactions", row.date, row.date === null ? "no date" : "impossible date")
      continue
    }
    if (row.date > options.today) {
      skip("transactions", row.date, "generated future row")
      continue
    }
    if (row.amountCents === 0) {
      skip("transactions", row.date, "zero amount")
      continue
    }
    const schedule =
      row.scheduleId === null ? undefined : schedules.get(ref(row.kind, row.scheduleId))
    drafts.push({
      base: {
        sourceKey: key,
        date: row.date,
        amountCents: signed(row.kind, row.amountCents),
        category: newCategory(schedule?.categoryId ?? null),
        bankDescription: null,
      },
      sourceDate: row.date,
      scheduleAccount: scheduleName(row),
      payee: null,
      notes: [row.note],
    })
  }

  // Accounts: Schedule names used by history, then payees on enough rows.
  const accounts = new Names()
  for (const draft of drafts)
    if (draft.scheduleAccount !== null) accounts.add(draft.scheduleAccount)
  const payeeRows = new Map<string, number>()
  for (const draft of drafts) {
    if (draft.payee === null) continue
    const key = draft.payee.toLowerCase()
    payeeRows.set(key, (payeeRows.get(key) ?? 0) + 1)
  }
  for (const draft of drafts) {
    count(
      draft.base.sourceKey.startsWith("ledger:") ? "ledger" : "transactions",
      draft.sourceDate,
      "written",
    )
  }
  const actuals = drafts.map(({ base, scheduleAccount, payee, notes }): PlannedActual => {
    let account = scheduleAccount === null ? null : (accounts.get(scheduleAccount) ?? null)
    let payeeNote: string | null = null
    if (account === null && payee !== null) {
      if ((payeeRows.get(payee.toLowerCase()) ?? 0) >= PAYEE_ACCOUNT_MIN_ROWS) {
        account = accounts.add(payee)
      } else {
        payeeNote = payee
        counted.payeesMovedToNotes += 1
      }
    }
    return { ...base, account, note: joinNote([payeeNote, ...notes]) }
  })

  // Balance checks: the last entry of each household day.
  const lastOfDay = new Map<string, { enteredAt: string; id: string; amountCents: number }>()
  for (const row of extract.balances) {
    const date = row.enteredAt.slice(0, 10)
    if (!hasPlausibleYear(date)) {
      skip("balances", date, "impossible date")
      continue
    }
    const current = lastOfDay.get(date)
    if (current === undefined) {
      lastOfDay.set(date, row)
      continue
    }
    // Of the two, the earlier entry is skipped; a tie keeps the later row in the file.
    skip("balances", date, "an earlier entry that day")
    if (row.enteredAt >= current.enteredAt) lastOfDay.set(date, row)
  }
  const balanceChecks = [...lastOfDay.entries()]
    .map(([date, row]) => ({ date, amountCents: row.amountCents }))
    .toSorted((a, b) => a.date.localeCompare(b.date))
  for (const check of balanceChecks) count("balances", check.date, "written")

  // Failures.
  for (const name of [...unmapped].toSorted())
    failures.push(`Old category not in the mapping: ${name}`)
  const keys = new Map<string, number>()
  for (const actual of actuals) keys.set(actual.sourceKey, (keys.get(actual.sourceKey) ?? 0) + 1)
  const duplicateKeys = [...keys.values()].filter((uses) => uses > 1).length
  if (duplicateKeys > 0) failures.push(`${duplicateKeys} import keys would be used more than once`)
  for (const [table, byYear] of Object.entries(years)) {
    for (const [year, counts] of byYear) {
      if (counts.read !== counts.written + counts.skipped) {
        failures.push(
          `${table} ${year}: ${counts.read} read ≠ ${counts.written} written + ${counts.skipped} skipped`,
        )
      }
    }
  }
  const totals = categoryTotals(extract, actuals, { today: options.today })
  const differing = totals.filter((t) => t.oldCents !== t.newCents).length
  if (differing > 0)
    failures.push(`${differing} monthly Category totals differ between old and new`)

  return {
    wallet: { name: CHECKING, inForecast: true },
    categories: CATEGORY_NAMES,
    accounts: accounts.values(),
    actuals,
    balanceChecks,
    report: {
      years,
      undated: { categories: extract.categories.length, schedules: extract.schedules.length },
      skipped,
      counted,
      categoryTotals: totals,
      failures,
    },
  }
}

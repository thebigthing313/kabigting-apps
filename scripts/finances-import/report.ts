/**
 * The import report as lines of text: counts per table and year, skip reasons, the counted-only
 * figures, old and new Category totals side by side, and the failures. It never prints a row.
 */
import { format } from "#shared/money.ts"
import type { DatedTable, ImportPlan } from "./plan.ts"

const UNCATEGORISED = "Uncategorised"

function pad(value: string | number, width: number): string {
  return String(value).padStart(width)
}

function yearRows(plan: ImportPlan): string[] {
  const lines: string[] = []
  for (const table of ["transactions", "ledger", "balances"] satisfies DatedTable[]) {
    for (const [year, counts] of [...plan.report.years[table]].toSorted(([a], [b]) =>
      a.localeCompare(b),
    )) {
      lines.push(
        `  ${table.padEnd(12)} ${year.padEnd(7)} ${pad(counts.read, 7)} ${pad(counts.written, 8)} ${pad(counts.skipped, 8)}`,
      )
    }
  }
  return lines
}

/** Category totals summed per year, old beside new; every month that differs is listed too. */
function totalRows(plan: ImportPlan): string[] {
  const byYear = new Map<string, { old: number; new: number }>()
  for (const total of plan.report.categoryTotals) {
    const key = `${total.month.slice(0, 4)} ${total.category ?? UNCATEGORISED}`
    const sums = byYear.get(key) ?? { old: 0, new: 0 }
    sums.old += total.oldCents
    sums.new += total.newCents
    byYear.set(key, sums)
  }
  const lines = [...byYear].map(
    ([key, sums]) =>
      `  ${key.padEnd(30)} ${pad(format(sums.old), 15)} ${pad(format(sums.new), 15)}`,
  )
  const differing = plan.report.categoryTotals.filter((t) => t.oldCents !== t.newCents)
  if (differing.length > 0) {
    lines.push("  Months that differ:")
    for (const total of differing) {
      lines.push(
        `    ${`${total.month} ${total.category ?? UNCATEGORISED}`.padEnd(28)} ${pad(format(total.oldCents), 15)} ${pad(format(total.newCents), 15)}`,
      )
    }
  }
  return lines
}

export function formatReport(plan: ImportPlan): string[] {
  const { report } = plan
  const skipped = [...report.skipped].toSorted(([a], [b]) => a.localeCompare(b))
  return [
    `Read: ${report.undated.categories} old categories, ${report.undated.schedules} old schedules`,
    "Rows per table and year:",
    `  ${"table".padEnd(12)} ${"year".padEnd(7)} ${pad("read", 7)} ${pad("written", 8)} ${pad("skipped", 8)}`,
    ...yearRows(plan),
    "Skipped rows by reason:",
    ...(skipped.length === 0 ? ["  none"] : skipped.map(([reason, n]) => `  ${reason}: ${n}`)),
    "Counted:",
    `  transactions whose ledger rows don't sum to them: ${report.counted.linkedSumsDiffer}`,
    `  ledger rows linked to a missing transaction: ${report.counted.linksToMissingTransactions}`,
    `  dates from the bank date: ${report.counted.dateFromBankDate}`,
    `  dates from the ledger date: ${report.counted.dateFromLedgerDate}`,
    `  dates from the linked transaction: ${report.counted.dateFromTransactionDate}`,
    `  payees moved into notes: ${report.counted.payeesMovedToNotes}`,
    `To write: 1 Wallet (${plan.wallet.name}), ${plan.categories.length} Categories, ${plan.accounts.length} Accounts, ${plan.actuals.length} Actuals, ${plan.balanceChecks.length} Balance checks`,
    "Category totals per year, old and new:",
    ...totalRows(plan),
    ...(report.failures.length === 0
      ? ["No mismatches."]
      : ["Failures:", ...report.failures.map((failure) => `  ${failure}`)]),
  ]
}

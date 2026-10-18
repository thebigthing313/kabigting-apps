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

/** Every month's Category totals, old beside new, with differing ones marked. */
function totalRows(plan: ImportPlan): string[] {
  return plan.report.categoryTotals.map((total) => {
    const label = `${total.month} ${total.category ?? UNCATEGORISED}`.padEnd(30)
    const mark = total.oldCents === total.newCents ? "" : "  DIFFERS"
    return `  ${label} ${pad(format(total.oldCents), 15)} ${pad(format(total.newCents), 15)}${mark}`
  })
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
    `  impossible bank date, fell back: ${report.counted.impossibleBankDateFellBack}`,
    `  payees moved into notes: ${report.counted.payeesMovedToNotes}`,
    `  balances rounded to the cent: ${report.counted.balancesRoundedToCent}`,
    `To write: 1 Wallet (${plan.wallet.name}), ${plan.categories.length} Categories, ${plan.accounts.length} Accounts, ${plan.actuals.length} Actuals, ${plan.balanceChecks.length} Balance checks`,
    "Monthly Category totals, old and new:",
    ...totalRows(plan),
    ...(report.failures.length === 0
      ? ["No mismatches."]
      : ["Failures:", ...report.failures.map((failure) => `  ${failure}`)]),
  ]
}

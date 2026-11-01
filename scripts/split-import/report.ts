/**
 * The import report as lines of text: rows read and skipped, entries per year, count and total per
 * Category per year, each Member by number with App access and both Balances, then the failures.
 * It never prints a name, an email, a description or a row.
 */
import { format } from "#shared/money.ts"
import type { ImportPlan, MemberCheck } from "./plan.ts"

function pad(value: string | number, width: number): string {
  return String(value).padStart(width)
}

function money(cents: number | null): string {
  return cents === null ? "?" : format(cents)
}

function memberRow(member: MemberCheck): string {
  const access = member.access === null ? "?" : member.access ? "yes" : "no"
  const cents =
    member.computed === null || member.splitwise === null
      ? null
      : member.computed - member.splitwise
  const difference = cents === null ? "?" : format(cents, { sign: "always" })
  const mark = cents === 0 ? "" : "  DIFFERS"
  return `  ${pad(member.number, 6)} ${access.padEnd(6)} ${pad(money(member.computed), 14)} ${pad(money(member.splitwise), 14)} ${pad(difference, 14)}${mark}`
}

export function formatReport(plan: ImportPlan): string[] {
  const { report } = plan
  const years = [...report.years].toSorted(([a], [b]) => a.localeCompare(b))
  return [
    `Rows read: ${report.rowsRead}, deleted rows skipped: ${report.deleted}`,
    `To write: ${plan.expenses.length} Expenses and ${plan.payments.length} Payments`,
    "Per year:",
    `  ${"year".padEnd(6)} ${pad("expenses", 9)} ${pad("refunds", 8)} ${pad("payments", 9)}`,
    ...years.map(
      ([year, counts]) =>
        `  ${year.padEnd(6)} ${pad(counts.expenses, 9)} ${pad(counts.refunds, 8)} ${pad(counts.payments, 9)}`,
    ),
    "Per Category and year:",
    ...report.categories.map(
      (line) =>
        `  ${line.year} ${line.category.padEnd(20)} ${pad(line.count, 6)} ${pad(format(line.total), 14)}`,
    ),
    "Members, numbered by Splitwise user id, ascending:",
    `  ${pad("member", 6)} ${"access".padEnd(6)} ${pad("computed", 14)} ${pad("Splitwise", 14)} ${pad("difference", 14)}`,
    ...report.members.map(memberRow),
    ...(report.failures.length === 0
      ? ["No mismatches."]
      : ["Failures:", ...report.failures.map((failure) => `  ${failure}`)]),
  ]
}

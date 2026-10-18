import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"
import { UNCATEGORISED_PARAM } from "@/apps/finances/categories/category-page"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useCategories } from "@/data/finances-categories"
import { type Transaction, useActualsBetween, useFirstActual } from "@/data/finances-transactions"
import { cn } from "cn"
import {
  formatMonth,
  formatShortMonth,
  monthDates,
  monthOfDate,
  shiftMonth,
  thisMonth,
} from "@shared/dates"
import {
  AVERAGE_MONTHS,
  type Figures,
  isFarOverAverage,
  monthlySummary,
  type MonthlySummary,
  summaryMonths,
  type SummaryLine,
} from "@shared/finances/summary"
import { format } from "@shared/money"

/** One month's income, spending and net, and every Category, against last month and average. */
export function SummaryPage({ month }: { month: string | undefined }) {
  const current = thisMonth()
  const { first, isLoading } = useFirstActual()
  const firstMonth = first === undefined ? undefined : monthOfDate(first.date)
  const { earliest, shown } = summaryMonths(firstMonth, current, month)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-8">
      <h1 className="text-2xl font-semibold">Summary</h1>
      {isLoading ? (
        <SummarySkeleton />
      ) : (
        <>
          <MonthPicker month={shown} earliest={earliest} latest={current} />
          <MonthSummary month={shown} first={first} />
        </>
      )}
      <Link to="/finances/categories" className="self-start text-sm underline">
        Manage Categories
      </Link>
    </div>
  )
}

function MonthPicker({
  month,
  earliest,
  latest,
}: {
  month: string
  earliest: string
  latest: string
}) {
  const navigate = useNavigate()
  const go = (to: string) => void navigate({ to: "/finances/summary", search: { month: to } })
  return (
    <div className="flex items-center justify-between gap-2">
      <Button
        variant="outline"
        size="icon-lg"
        aria-label="Previous month"
        disabled={month <= earliest}
        onClick={() => go(shiftMonth(month, -1))}
      >
        <ChevronLeftIcon />
      </Button>
      <h2 className="text-center text-xl font-semibold">
        {formatMonth(month)}
        {month === latest ? (
          <>
            {" "}
            <span className="text-sm font-normal text-muted-foreground">so far</span>
          </>
        ) : null}
      </h2>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label="Next month"
        disabled={month >= latest}
        onClick={() => go(shiftMonth(month, 1))}
      >
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

function MonthSummary({ month, first }: { month: string; first: Transaction | undefined }) {
  const from = monthDates(shiftMonth(month, -AVERAGE_MONTHS)).first
  const { data: actuals, isLoading } = useActualsBetween(from, monthDates(month).last)
  const { data: categories, isLoading: categoriesLoading } = useCategories()
  if (isLoading || categoriesLoading) return <SummarySkeleton />

  // The first Actual places the first month even when it is older than the window.
  const rows = first !== undefined && first.date < from ? [...actuals, first] : actuals
  const summary = monthlySummary(rows, categories, month)
  return (
    <>
      <Totals month={month} totals={summary.totals} />
      <IncomeList lines={summary.income} month={month} />
      <SpendingList summary={summary} month={month} />
    </>
  )
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-10" />
      <Skeleton className="h-36" />
      <Skeleton className="h-48" />
    </div>
  )
}

const TOTAL_ROWS = [
  ["Income", "incomeCents"],
  ["Spending", "spendingCents"],
  ["Net", "netCents"],
] as const

function Totals({ month, totals }: { month: string; totals: MonthlySummary["totals"] }) {
  const columns: [string, Figures][] = [
    [formatShortMonth(month), totals.month],
    ["Last month", totals.lastMonth],
    ["12-mo avg", totals.average],
  ]
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm tabular-nums" aria-label="Totals">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <td className="px-2 py-2 sm:px-3" />
            {columns.map(([label]) => (
              <th key={label} scope="col" className="px-2 py-2 text-right font-medium sm:px-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TOTAL_ROWS.map(([label, key]) => (
            <tr key={key} className={cn(key === "netCents" && "border-t font-semibold")}>
              <th scope="row" className="px-2 py-2 text-left font-medium sm:px-3">
                {label}
              </th>
              {columns.map(([column, figures], index) => (
                <td
                  key={column}
                  className={cn(
                    "px-2 py-2 text-right whitespace-nowrap sm:px-3",
                    index > 0 && "text-muted-foreground",
                  )}
                >
                  {format(figures[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ArchivedMark() {
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
      archived
    </span>
  )
}

function CategoryName({ line }: { line: SummaryLine }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className={cn("truncate", line.categoryId === null && "italic")}>{line.name}</span>
      {line.archived ? <ArchivedMark /> : null}
    </span>
  )
}

/** A summary row that opens its Category's page for the same month. */
function CategoryLink({
  line,
  month,
  className,
  children,
}: {
  line: SummaryLine
  month: string
  className: string
  children: ReactNode
}) {
  return (
    <Link
      to="/finances/categories/$categoryId"
      params={{ categoryId: line.categoryId ?? UNCATEGORISED_PARAM }}
      search={{ month }}
      className={cn(className, "hover:bg-muted/50")}
    >
      {children}
    </Link>
  )
}

function IncomeList({ lines, month }: { lines: readonly SummaryLine[]; month: string }) {
  if (lines.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted-foreground">Income</h3>
      <ul className="divide-y rounded-xl border" aria-label="Income Categories">
        {lines.map((line) => {
          const difference = line.monthCents - line.averageCents
          return (
            <li key={line.categoryId}>
              <CategoryLink
                line={line}
                month={month}
                className="flex min-h-12 items-center justify-between gap-3 px-4 py-2"
              >
                <CategoryName line={line} />
                <span className="shrink-0 text-right tabular-nums">
                  <span className="block font-medium">{format(line.monthCents)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {difference === 0
                      ? "same as avg"
                      : `${format(difference, { sign: "always" })} vs avg`}
                  </span>
                </span>
              </CategoryLink>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SpendingList({ summary, month }: { summary: MonthlySummary; month: string }) {
  const lines = summary.uncategorised
    ? [...summary.spending, summary.uncategorised]
    : summary.spending
  if (lines.length === 0) {
    return summary.income.length === 0 ? (
      <p className="rounded-xl border p-6 text-center text-muted-foreground">
        No Actuals this month.
      </p>
    ) : null
  }
  // Bars share one scale, wide enough for the biggest spend or average.
  const peak = Math.max(1, ...lines.flatMap((line) => [-line.monthCents, -line.averageCents]))
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <h3 className="font-medium">Spending</h3>
        <span className="flex items-center gap-1 text-xs" aria-hidden="true">
          <span className="inline-block h-3 w-0.5 bg-foreground" /> 12-mo avg
        </span>
      </div>
      <ul className="divide-y rounded-xl border" aria-label="Spending Categories">
        {lines.map((line) => (
          <SpendingRow
            key={line.categoryId ?? UNCATEGORISED_PARAM}
            line={line}
            peak={peak}
            month={month}
          />
        ))}
      </ul>
    </section>
  )
}

function share(cents: number, peak: number): string {
  return `${(Math.max(0, cents) / peak) * 100}%`
}

function SpendingRow({ line, peak, month }: { line: SummaryLine; peak: number; month: string }) {
  const over = isFarOverAverage(line)
  return (
    <li>
      <CategoryLink line={line} month={month} className="flex flex-col gap-1 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <CategoryName line={line} />
          <span className="flex shrink-0 items-center gap-2 tabular-nums">
            {over ? <span className="text-xs font-medium text-destructive">Over avg</span> : null}
            <span className="font-medium">{format(line.monthCents)}</span>
          </span>
        </div>
        <div className="relative h-3 rounded bg-muted" aria-hidden="true">
          <div
            className={cn("h-full rounded", over ? "bg-destructive" : "bg-primary")}
            style={{ width: share(-line.monthCents, peak) }}
          />
          <div
            className="absolute -top-0.5 h-4 w-0.5 bg-foreground"
            style={{ left: share(-line.averageCents, peak) }}
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Last month {format(line.lastMonthCents)} · avg {format(line.averageCents)}
        </p>
      </CategoryLink>
    </li>
  )
}

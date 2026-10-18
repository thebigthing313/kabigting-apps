import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import { CategoryActions } from "@/apps/finances/categories/category-actions"
import { CategoryChart } from "@/apps/finances/categories/category-chart"
import {
  type ActivityRow,
  EditActivityDialog,
} from "@/apps/finances/transactions/transaction-dialogs"
import { transactionLabel } from "@/apps/finances/transactions/transaction-display"
import { Skeleton } from "@/components/ui/skeleton"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { type Category, useCategories } from "@/data/finances-categories"
import { type Transaction, useActualsBetween, useFirstActual } from "@/data/finances-transactions"
import { useWallets } from "@/data/finances-wallets"
import {
  formatDisplayDate,
  formatMonth,
  formatShortMonth,
  monthDates,
  monthOfDate,
  shiftMonth,
  thisMonth,
} from "@shared/dates"
import { AVERAGE_MONTHS, categoryYear, countedUnder, summaryMonths } from "@shared/finances/summary"
import { toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

/** The `$categoryId` that stands for Uncategorised, which has a page but no row. */
export const UNCATEGORISED_PARAM = "uncategorised"

/**
 * One Category's month, reached from the Monthly summary: its year of bars against the average,
 * the month's figures and Actuals, and Rename, Merge into… and Archive or Unarchive.
 * Uncategorised (`categoryId` null) has the page but no actions.
 */
export function CategoryPage({
  categoryId,
  month,
}: {
  categoryId: string | null
  month: string | undefined
}) {
  const current = thisMonth()
  const { first, isLoading: firstLoading } = useFirstActual()
  const { data: categories, isLoading: categoriesLoading } = useCategories()
  const firstMonth = first === undefined ? undefined : monthOfDate(first.date)
  const { shown } = summaryMonths(firstMonth, current, month)
  const category = categories.find((candidate) => candidate.id === categoryId)
  const loading = firstLoading || categoriesLoading

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-8">
      <Link
        to="/finances/summary"
        search={{ month: loading ? month : shown }}
        className="-ml-2 flex h-10 items-center gap-1 self-start px-2 text-sm text-muted-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        {loading ? "Summary" : formatMonth(shown)}
      </Link>

      {loading ? (
        <CategorySkeleton />
      ) : categoryId !== null && category === undefined ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          There is no such Category.
        </p>
      ) : (
        <>
          <CategoryHeader category={category} categories={categories} month={shown} />
          <CategoryMonth
            categoryId={categoryId}
            categories={categories}
            month={shown}
            first={first}
          />
        </>
      )}
    </div>
  )
}

function CategorySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-10" />
      <Skeleton className="h-44" />
      <Skeleton className="h-24" />
    </div>
  )
}

function CategoryHeader({
  category,
  categories,
  month,
}: {
  /** Undefined for Uncategorised. */
  category: Category | undefined
  categories: readonly Category[]
  month: string
}) {
  const target = categories.find((candidate) => candidate.id === category?.mergedIntoId)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className={cn("text-2xl font-semibold break-words", !category && "italic")}>
          {category?.name ?? "Uncategorised"}
        </h1>
        {category?.archived ? (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            {category.mergedIntoId ? "Merged" : "Archived"}
          </span>
        ) : null}
      </div>
      {target ? (
        <p className="text-sm text-muted-foreground">
          Merged into{" "}
          <Link
            to="/finances/categories/$categoryId"
            params={{ categoryId: target.id }}
            search={{ month }}
            className="text-foreground underline"
          >
            {target.name}
          </Link>
          ; its Actuals count there.
        </p>
      ) : null}
      {category ? <CategoryActions category={category} categories={categories} /> : null}
    </div>
  )
}

function CategoryMonth({
  categoryId,
  categories,
  month,
  first,
}: {
  categoryId: string | null
  categories: readonly Category[]
  month: string
  first: Transaction | undefined
}) {
  // The same rows as the summary's, so the figures match it and the cache is shared.
  const from = monthDates(shiftMonth(month, -AVERAGE_MONTHS)).first
  const { first: monthFirst, last: monthLast } = monthDates(month)
  const { data: actuals, isLoading } = useActualsBetween(from, monthLast)
  const { data: wallets } = useWallets()
  const { data: accounts } = useFinancesAccounts()
  const [editing, setEditing] = useState<ActivityRow | null>(null)
  if (isLoading) return <CategorySkeleton />

  const under = countedUnder(categories)
  const rows = first !== undefined && first.date < from ? [...actuals, first] : actuals
  const year = categoryYear(
    rows.map((row) => ({ ...row, categoryId: under(row.categoryId) })),
    categoryId,
    month,
  )
  const monthCents = year.bars.at(-1)?.cents ?? 0
  const lastMonthCents = year.bars.at(-2)?.cents ?? 0
  const inMonth = actuals
    .filter(
      (row) =>
        under(row.categoryId) === categoryId && row.date >= monthFirst && row.date <= monthLast,
    )
    .toSorted((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))

  const figures: [string, number][] = [
    [formatShortMonth(month), monthCents],
    ["Last month", lastMonthCents],
    ["12-mo avg", year.averageCents],
  ]

  return (
    <>
      <CategoryChart
        year={year}
        month={month}
        description={`Monthly net for the 12 months to ${formatMonth(month)}, against the 12-month average of ${format(year.averageCents)}`}
      />
      <dl className="grid grid-cols-3 divide-x rounded-xl border text-center tabular-nums">
        {figures.map(([label, cents], index) => (
          <div key={label} className="flex flex-col gap-0.5 px-2 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn("font-medium", index > 0 && "text-muted-foreground")}>
              {format(cents)}
            </dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="month-actuals" className="flex flex-col gap-2">
        <h2 id="month-actuals" className="font-medium">
          Actuals in {formatMonth(month)}
        </h2>
        {inMonth.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-muted-foreground">
            No Actuals this month.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border" aria-label="Actuals">
            {inMonth.map((row) => {
              const wallet = walletById.get(row.walletId)
              const shown = wallet ? toShown(wallet, row.amountCents) : row.amountCents
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setEditing({ kind: "transaction", row })}
                    className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{transactionLabel(row, accountName)}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {formatDisplayDate(row.date)} · {wallet?.name ?? "A Wallet"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium tabular-nums",
                        shown > 0 && "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {format(shown, { sign: "always" })}
                    </span>
                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <EditActivityDialog editing={editing} onClose={() => setEditing(null)} />
    </>
  )
}

import { cn } from "cn"
import { useState } from "react"
import type { People } from "@/apps/split/words"
import type { Expense } from "@/data/split"
import { formatDisplayDate, today } from "@shared/dates"
import { format } from "@shared/money"
import { effectOn } from "@shared/split/rules"
import {
  DEFAULT_SPENDING_PERIOD,
  periodRange,
  SPENDING_PERIOD_LABELS,
  SPENDING_PERIODS,
  spending,
  type SpendingPeriod,
} from "@shared/split/spending"

type SpendingTabProps = {
  expenses: readonly Expense[]
  /** Every Category's name by id, archived ones included. */
  categoryName: ReadonlyMap<string, string>
  who: People
}

/** Newest first: by date, then the one added last. */
function newestFirst(a: Expense, b: Expense): number {
  return b.date.localeCompare(a.date) || b.addedAt.localeCompare(a.addedAt)
}

/**
 * The Spending tab: a period's total and a bar per Category, largest first, counting Expense
 * totals for the household or only the viewer's Owed shares. Tapping a bar lists its Expenses;
 * tapping it again clears them. Payments never count; a Refund nets against its Category.
 */
export function SpendingTab({ expenses, categoryName, who }: SpendingTabProps) {
  const [period, setPeriod] = useState<SpendingPeriod>(DEFAULT_SPENDING_PERIOD)
  const [mine, setMine] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const nameOf = (categoryId: string) => categoryName.get(categoryId) ?? "No Category"
  const result = spending(
    expenses,
    periodRange(period, today()),
    mine ? { memberId: who.viewerId } : "household",
  )
  // Largest first; equal amounts by name.
  const categories = result.categories.toSorted(
    (a, b) => b.cents - a.cents || nameOf(a.categoryId).localeCompare(nameOf(b.categoryId)),
  )
  const widest = Math.max(1, ...categories.map((category) => category.cents))
  // A Category the period or the switch left out is no longer selected.
  const selected = categories.find((category) => category.categoryId === picked) ?? null

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label="Period" className="flex flex-wrap gap-1.5">
        {SPENDING_PERIODS.map((each) => (
          <button
            key={each}
            type="button"
            role="radio"
            aria-checked={period === each}
            onClick={() => setPeriod(each)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              period === each && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {SPENDING_PERIOD_LABELS[each]}
          </button>
        ))}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div aria-label="Spending total" role="group">
          <div className="text-2xl font-semibold tabular-nums">{format(result.total)}</div>
          <div className="text-xs text-muted-foreground">
            {mine ? "Your share" : "Household spending"} ·{" "}
            {SPENDING_PERIOD_LABELS[period].toLowerCase()}
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="Whose spending"
          className="flex shrink-0 rounded-lg border p-0.5 text-sm"
        >
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={mine === value}
              onClick={() => setMine(value)}
              className={cn(
                "rounded-md px-2.5 py-1",
                mine === value ? "bg-muted font-medium" : "text-muted-foreground",
              )}
            >
              {value ? "My share" : "Household"}
            </button>
          ))}
        </div>
      </div>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Expenses in this period.</p>
      ) : (
        <>
          <ul aria-label="Spending by Category" className="flex flex-col">
            {categories.map((category) => {
              const isPicked = selected?.categoryId === category.categoryId
              return (
                <li key={category.categoryId}>
                  <button
                    type="button"
                    aria-pressed={isPicked}
                    onClick={() => setPicked(isPicked ? null : category.categoryId)}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-lg px-2 py-1.5 text-left hover:bg-muted/50",
                      isPicked && "bg-muted",
                    )}
                  >
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className={cn(isPicked && "font-medium")}>
                        {nameOf(category.categoryId)}
                      </span>
                      <span className="tabular-nums">{format(category.cents)}</span>
                    </span>
                    {/* The bar grows from the left; a Category the Refunds outweigh draws none.
                        With one picked, the others' bars fade but their words stay readable. */}
                    <span aria-hidden className="block h-2.5 w-full">
                      <span
                        className={cn(
                          "block h-full rounded-r-[4px] bg-primary",
                          selected && !isPicked && "opacity-30",
                        )}
                        style={{ width: `${(Math.max(0, category.cents) / widest) * 100}%` }}
                      />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Tap a Category to see its Expenses. Refunds count against their Category; Payments
            aren&apos;t spending.
          </p>
        </>
      )}
      {selected && (
        <section
          aria-label={`${nameOf(selected.categoryId)} Expenses`}
          className="flex flex-col gap-1"
        >
          <h3 className="text-sm font-semibold">{nameOf(selected.categoryId)}</h3>
          <ul className="flex flex-col divide-y rounded-xl border">
            {selected.expenses
              .toSorted((a, b) => newestFirst(a.expense, b.expense))
              .map(({ expense, cents }) => {
                const yours = effectOn(expense, who.viewerId)
                return (
                  <li key={expense.id} className="flex justify-between gap-2 p-2.5 text-sm">
                    <span className="flex flex-col">
                      <span>{expense.description}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDisplayDate(expense.date)} ·{" "}
                        {yours === 0
                          ? "Doesn't involve you"
                          : `Your Balance ${format(yours, { sign: "always" })}`}
                      </span>
                    </span>
                    <span className="tabular-nums">{format(cents)}</span>
                  </li>
                )
              })}
          </ul>
        </section>
      )}
    </div>
  )
}

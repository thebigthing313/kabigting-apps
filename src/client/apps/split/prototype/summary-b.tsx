// PROTOTYPE, throwaway. Summaries B: no new screen. The Variant B Home's Balance card names every
// Member's Balance as a chip, and a month stepper above the feed drives a "this month" spending
// card (one proportion bar plus a legend) and the feed below it, so the period is always a month.
import { cn } from "cn"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { formatDisplayDate, formatMonth, monthDates, shiftMonth, thisMonth } from "@shared/dates"
import { format } from "@shared/money"
import { Signed } from "@/apps/split/prototype/common"
import { MEMBERS, type Store, categoryName, effect, memberName } from "@/apps/split/prototype/store"
import { byCategory, expensesIn } from "@/apps/split/prototype/summary"

const SHADES = ["bg-chart-5", "bg-chart-4", "bg-chart-3", "bg-chart-2", "bg-chart-1"]

export function SummaryB({ store }: { store: Store }) {
  const [month, setMonth] = useState(thisMonth())
  const [mineOnly, setMineOnly] = useState(false)
  const { first, last } = monthDates(month)
  const expenses = expensesIn(store.entries, first, last)
  const totals = byCategory(expenses, mineOnly ? store.viewerId : null)
  // Four biggest Categories by name, the rest folded into one slice.
  const slices = [
    ...totals.slice(0, 4),
    ...(totals.length > 4
      ? [
          {
            categoryId: "rest",
            name: `${totals.length - 4} more`,
            cents: totals.slice(4).reduce((s, t) => s + t.cents, 0),
            count: 0,
          },
        ]
      : []),
  ]
  const sum = totals.reduce((s, t) => s + t.cents, 0)
  const previous = expensesIn(store.entries, ...dates(shiftMonth(month, -1)))
  const prevSum = byCategory(previous, mineOnly ? store.viewerId : null).reduce(
    (s, t) => s + t.cents,
    0,
  )
  const feed = store.entries.filter((e) => e.date >= first && e.date <= last)
  const mine = store.balances[store.viewerId] ?? 0

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <div className="text-sm opacity-80">Your Balance</div>
        <div className="text-3xl font-semibold tabular-nums">
          {format(mine, { sign: "always" })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {MEMBERS.filter(
            (m) => m.id !== store.viewerId && (!m.former || store.balances[m.id] !== 0),
          ).map((member) => {
            const cents = store.balances[member.id] ?? 0
            return (
              <span
                key={member.id}
                className={cn(
                  "rounded-full bg-primary-foreground/15 px-3 py-1 text-sm",
                  member.former && "border border-dashed border-primary-foreground/50",
                )}
              >
                {member.name}
                {member.former && " (former)"}{" "}
                <span className="font-medium tabular-nums">
                  {cents === 0
                    ? "settled"
                    : cents > 0
                      ? `is owed ${format(cents)}`
                      : `owes ${format(-cents)}`}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setMonth(shiftMonth(month, -1))}>
          <ChevronLeftIcon />
        </Button>
        <span className="font-medium">{formatMonth(month)}</span>
        <Button
          variant="ghost"
          size="icon"
          disabled={month >= thisMonth()}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs text-muted-foreground">
              {mineOnly ? "Your share" : "Household spending"}
            </div>
            <div className="text-2xl font-semibold tabular-nums">{format(sum)}</div>
            <div className="text-xs text-muted-foreground">
              {prevSum === 0
                ? "Nothing the month before"
                : `${sum >= prevSum ? "+" : "−"}${format(Math.abs(sum - prevSum))} on ${formatMonth(shiftMonth(month, -1))}`}
            </div>
          </div>
          <button
            type="button"
            className="text-xs underline underline-offset-2"
            onClick={() => setMineOnly(!mineOnly)}
          >
            {mineOnly ? "Show household" : "Show my share"}
          </button>
        </div>
        {sum > 0 && (
          <div className="flex h-4 overflow-hidden rounded-full" aria-hidden>
            {slices.map((slice, i) => (
              <div
                key={slice.categoryId}
                className={SHADES[i]}
                style={{ width: `${(Math.max(0, slice.cents) / sum) * 100}%` }}
              />
            ))}
          </div>
        )}
        <ul className="flex flex-col gap-1 text-sm">
          {slices.map((slice, i) => (
            <li key={slice.categoryId} className="flex items-center gap-2">
              <span className={cn("size-3 rounded-sm", SHADES[i])} />
              <span className="flex-1">{slice.name}</span>
              <span className="text-xs text-muted-foreground">
                {sum > 0 ? `${Math.round((slice.cents / sum) * 100)}%` : ""}
              </span>
              <span className="w-20 text-right tabular-nums">{format(slice.cents)}</span>
            </li>
          ))}
          {slices.length === 0 && (
            <li className="text-muted-foreground">No Expenses this month.</li>
          )}
        </ul>
      </div>

      <ul className="flex flex-col gap-2">
        {feed.map((entry) => {
          const you = effect(entry)[store.viewerId] ?? 0
          return (
            <li key={entry.id} className="flex flex-col gap-1 rounded-xl border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">
                  {entry.kind === "expense"
                    ? entry.description
                    : `${memberName(entry.fromId)} → ${memberName(entry.toId)}`}
                </span>
                <span className="tabular-nums">
                  {format(entry.kind === "expense" ? entry.total : entry.amount)}
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {formatDisplayDate(entry.date)} ·{" "}
                  {entry.kind === "expense" ? categoryName(entry.categoryId) : "Payment"}
                </span>
                {you === 0 ? "Doesn't involve you" : <Signed cents={you} />}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function dates(month: string): [string, string] {
  const { first, last } = monthDates(month)
  return [first, last]
}

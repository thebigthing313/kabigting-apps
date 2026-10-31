import { PlusIcon, TagsIcon } from "lucide-react"
import {
  people,
  sideWords,
  memberBalanceWords,
  viewerBalanceWords,
  type People,
} from "@/apps/split/words"
import { Button } from "@/components/ui/button"
import type { Category, Expense, Member } from "@/data/split"
import { formatDisplayDate } from "@shared/dates"
import { format } from "@shared/money"
import { balances, effectOn } from "@shared/split/rules"

type HomeViewProps = {
  viewerId: string
  /** Oldest Account first. */
  members: readonly Member[]
  expenses: readonly Expense[]
  categories: readonly Category[]
  onAddExpense: () => void
  onManageCategories: () => void
}

/** Newest first: by date, then the one added last. */
function newestFirst(a: Expense, b: Expense): number {
  return b.date.localeCompare(a.date) || b.addedAt.localeCompare(a.addedAt)
}

/**
 * Split's Home: the viewer's Balance and every other Member's, the Add Expense button, the way to
 * the Categories, and the Activity feed.
 */
export function HomeView({
  viewerId,
  members,
  expenses,
  categories,
  onAddExpense,
  onManageCategories,
}: HomeViewProps) {
  const who = people(viewerId, members)
  const totals = balances(
    expenses,
    members.map((member) => member.id),
  )
  const mine = totals[viewerId] ?? 0
  const others = members.filter((member) => member.id !== viewerId)
  const categoryName = new Map(categories.map((category) => [category.id, category.name]))

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <section
        aria-label="Your Balance"
        className="rounded-2xl bg-primary p-5 text-primary-foreground"
      >
        <div className="text-sm opacity-80">Your Balance</div>
        <div className="text-3xl font-semibold tabular-nums">
          {format(mine, { sign: "always" })}
        </div>
        <div className="text-sm font-medium">{viewerBalanceWords(mine)}</div>
        {others.length > 0 && (
          <ul className="mt-3 flex flex-col gap-0.5 text-sm opacity-90">
            {others.map((member) => (
              <li key={member.id}>{memberBalanceWords(member.name, totals[member.id] ?? 0)}</li>
            ))}
          </ul>
        )}
      </section>
      <Button size="lg" className="h-12" onClick={onAddExpense}>
        <PlusIcon /> Add Expense
      </Button>
      <Button variant="outline" className="h-11 self-start" onClick={onManageCategories}>
        <TagsIcon /> Categories
      </Button>
      <section aria-labelledby="split-activity" className="flex flex-col gap-2">
        <h2 id="split-activity" className="text-base font-semibold">
          Activity
        </h2>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet. Add an Expense to start.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expenses.toSorted(newestFirst).map((expense) => (
              <li key={expense.id}>
                <ExpenseCard
                  expense={expense}
                  categoryName={categoryName.get(expense.categoryId) ?? "No Category"}
                  who={who}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ExpenseCard({
  expense,
  categoryName,
  who,
}: {
  expense: Expense
  categoryName: string
  who: People
}) {
  const yours = effectOn(expense, who.viewerId)
  return (
    <article className="flex flex-col gap-1 rounded-xl border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{expense.description}</span>
        <span className="tabular-nums">{format(expense.total)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {formatDisplayDate(expense.date)} · {categoryName}
      </div>
      <div className="text-xs">{sideWords(expense.paidShares, "paid", who)}</div>
      <div className="text-xs">{sideWords(expense.owedShares, "owe", who)}</div>
      <div className="text-sm">
        {yours === 0 ? (
          <span className="text-muted-foreground">Doesn't involve you</span>
        ) : (
          <>Your Balance {format(yours, { sign: "always" })}</>
        )}
      </div>
    </article>
  )
}

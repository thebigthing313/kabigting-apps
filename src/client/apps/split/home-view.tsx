import { HandCoinsIcon, PlusIcon, TagsIcon } from "lucide-react"
import { PaymentCard } from "@/apps/split/payment-card"
import {
  authorshipWords,
  expenseSideWords,
  people,
  memberBalanceWords,
  viewerBalanceWords,
  type People,
} from "@/apps/split/words"
import { Button } from "@/components/ui/button"
import type { Category, Expense, Member, Payment } from "@/data/split"
import { formatDisplayDate } from "@shared/dates"
import { format } from "@shared/money"
import { effectOn, householdBalances } from "@shared/split/rules"

type HomeViewProps = {
  viewerId: string
  /** Oldest Account first. */
  members: readonly Member[]
  expenses: readonly Expense[]
  payments: readonly Payment[]
  categories: readonly Category[]
  onAddExpense: () => void
  onSettleUp: () => void
  /** Opens an Expense to change it; any Member can, whoever added it. */
  onOpenExpense: (expenseId: string) => void
  /** Opens a Payment to change it; any Member can, whoever added it. */
  onOpenPayment: (paymentId: string) => void
  onManageCategories: () => void
}

/** An entry in the Activity feed. */
type Activity = { kind: "expense"; entry: Expense } | { kind: "payment"; entry: Payment }

/** Newest first: by date, then the one added last. */
function newestFirst({ entry: a }: Activity, { entry: b }: Activity): number {
  return b.date.localeCompare(a.date) || b.addedAt.localeCompare(a.addedAt)
}

/**
 * Split's Home: the viewer's Balance and every other Member's, the Add Expense and Settle up
 * buttons, the way to the Categories, and the Activity feed of Expenses and Payments.
 */
export function HomeView({
  viewerId,
  members,
  expenses,
  payments,
  categories,
  onAddExpense,
  onSettleUp,
  onOpenExpense,
  onOpenPayment,
  onManageCategories,
}: HomeViewProps) {
  const who = people(viewerId, members)
  const totals = householdBalances(
    expenses,
    payments,
    members.map((member) => member.id),
  )
  const mine = totals[viewerId] ?? 0
  const others = members.filter((member) => member.id !== viewerId)
  const categoryName = new Map(categories.map((category) => [category.id, category.name]))
  const activity: Activity[] = [
    ...expenses.map((entry) => ({ kind: "expense" as const, entry })),
    ...payments.map((entry) => ({ kind: "payment" as const, entry })),
  ]

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
      <div className="grid grid-cols-2 gap-2">
        <Button size="lg" className="h-12" onClick={onAddExpense}>
          <PlusIcon /> Add Expense
        </Button>
        <Button size="lg" variant="outline" className="h-12" onClick={onSettleUp}>
          <HandCoinsIcon /> Settle up
        </Button>
      </div>
      <Button variant="outline" className="h-11 self-start" onClick={onManageCategories}>
        <TagsIcon /> Categories
      </Button>
      <section aria-labelledby="split-activity" className="flex flex-col gap-2">
        <h2 id="split-activity" className="text-base font-semibold">
          Activity
        </h2>
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Add an Expense or settle up to start.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activity.toSorted(newestFirst).map((item) => (
              <li key={item.entry.id}>
                {item.kind === "expense" ? (
                  <ExpenseCard
                    expense={item.entry}
                    categoryName={categoryName.get(item.entry.categoryId) ?? "No Category"}
                    who={who}
                    onOpen={() => onOpenExpense(item.entry.id)}
                  />
                ) : (
                  <PaymentCard
                    payment={item.entry}
                    who={who}
                    onOpen={() => onOpenPayment(item.entry.id)}
                  />
                )}
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
  onOpen,
}: {
  expense: Expense
  categoryName: string
  who: People
  onOpen: () => void
}) {
  const yours = effectOn(expense, who.viewerId)
  return (
    <article className="relative flex flex-col gap-1 rounded-xl border p-3 hover:bg-muted/50">
      {/* The whole card opens the Expense. */}
      <button
        type="button"
        aria-label={`Edit ${expense.description}`}
        onClick={onOpen}
        className="absolute inset-0 rounded-xl"
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{expense.description}</span>
        <span className="tabular-nums">{format(expense.total)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {formatDisplayDate(expense.date)} · {categoryName}
        {expense.total < 0 && " · Refund"}
      </div>
      <div className="text-xs">
        {expenseSideWords(expense.total, expense.paidShares, "paid", who)}
      </div>
      <div className="text-xs">
        {expenseSideWords(expense.total, expense.owedShares, "owed", who)}
      </div>
      <div className="text-sm">
        {yours === 0 ? (
          <span className="text-muted-foreground">Doesn't involve you</span>
        ) : (
          <>Your Balance {format(yours, { sign: "always" })}</>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{authorshipWords(expense, who)}</div>
    </article>
  )
}

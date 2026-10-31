import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { ExpenseFlow } from "@/apps/split/expense-flow"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { changeExpense, deleteExpense, useCategories, useExpenses, useMembers } from "@/data/split"
import { today } from "@shared/dates"

const appRoute = getRouteApi("/_app")

/**
 * Changing a saved Expense, full page: any Member can change or delete any Expense. It opens on
 * Review as it was entered; the draft lives only here, for as long as the page is open.
 */
export function EditExpensePage({ expenseId }: { expenseId: string }) {
  const { session } = appRoute.useRouteContext()
  const { data: expenses, isLoading } = useExpenses()
  const members = useMembers()
  const categories = useCategories()
  const navigate = useNavigate()
  const home = () => void navigate({ to: "/split" })
  if (isLoading || !members.data || !categories.data) {
    return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  }
  const expense = expenses.find((each) => each.id === expenseId)
  if (!expense) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3">
        <p>This Expense was deleted.</p>
        <Button variant="outline" onClick={home}>
          Back to Split
        </Button>
      </div>
    )
  }
  const memberIds = members.data.map((member) => member.id)
  return (
    <ExpenseFlow
      key={expense.id}
      viewerId={session.user.id}
      members={members.data}
      // An archived Category stays on the Expenses that have it.
      categories={categories.data.filter(
        (category) => !category.archived || category.id === expense.categoryId,
      )}
      today={today()}
      onCancel={home}
      onSave={async (changed) => {
        const stored = await changeExpense(expense, changed, session.user.id, memberIds)
        if (stored) home()
        return stored
      }}
      editing={{
        expense,
        // It goes at once, and so do its effects on the Balances; a failure is reported.
        onDelete: () => {
          home()
          void deleteExpense(expense.id)
        },
      }}
    />
  )
}

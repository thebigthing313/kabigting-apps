import { getRouteApi } from "@tanstack/react-router"
import { DeletedEntry, useEntryForm } from "@/apps/split/entry-form"
import { ExpenseFlow } from "@/apps/split/expense-flow"
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
  const expense = expenses.find((each) => each.id === expenseId)
  const entry = useEntryForm("Expense", { id: expenseId, row: expense, loaded: !isLoading })
  if (isLoading || !members.data || !categories.data) {
    return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  }
  if (!expense) return <DeletedEntry kind="Expense" onBack={entry.leave} />
  const memberIds = members.data.map((member) => member.id)
  return (
    <ExpenseFlow
      key={entry.formKey}
      viewerId={session.user.id}
      members={members.data}
      // An archived Category stays on the Expenses that have it.
      categories={categories.data.filter(
        (category) => !category.archived || category.id === expense.categoryId,
      )}
      today={today()}
      notice={entry.notice}
      onCancel={entry.leave}
      onSave={(changed) =>
        entry.save(() => changeExpense(expense, changed, session.user.id, memberIds))
      }
      editing={{
        expense,
        // It goes at once, and so do its effects on the Balances.
        onDelete: () => entry.remove(() => deleteExpense(expense.id)),
      }}
    />
  )
}

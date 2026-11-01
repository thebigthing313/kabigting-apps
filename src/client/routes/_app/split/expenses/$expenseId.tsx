import { createFileRoute } from "@tanstack/react-router"
import { EditExpensePage } from "@/apps/split/edit-expense-page"

export const Route = createFileRoute("/_app/split/expenses/$expenseId")({
  component: EditExpenseRoute,
})

function EditExpenseRoute() {
  const { expenseId } = Route.useParams()
  return <EditExpensePage expenseId={expenseId} />
}

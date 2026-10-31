import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { HomeView } from "@/apps/split/home-view"
import { Skeleton } from "@/components/ui/skeleton"
import { useCategories, useExpenses, useMembers, usePayments } from "@/data/split"

const appRoute = getRouteApi("/_app")

/**
 * The Split App's home: Balances, Add Expense, Settle up and the Activity feed, each Expense or
 * Payment opening it.
 */
export function SplitHome() {
  const { session } = appRoute.useRouteContext()
  const { data: expenses, isLoading } = useExpenses()
  const { data: payments, isLoading: paymentsLoading } = usePayments()
  const members = useMembers()
  const categories = useCategories()
  const navigate = useNavigate()
  if (isLoading || paymentsLoading || !members.data || !categories.data) {
    return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  }
  return (
    <HomeView
      viewerId={session.user.id}
      members={members.data}
      expenses={expenses}
      payments={payments}
      categories={categories.data}
      onAddExpense={() => void navigate({ to: "/split/expenses/new" })}
      onSettleUp={() => void navigate({ to: "/split/payments/new" })}
      onOpenExpense={(expenseId) =>
        void navigate({ to: "/split/expenses/$expenseId", params: { expenseId } })
      }
      onOpenPayment={(paymentId) =>
        void navigate({ to: "/split/payments/$paymentId", params: { paymentId } })
      }
      onManageCategories={() => void navigate({ to: "/split/categories" })}
    />
  )
}

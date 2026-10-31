import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { HomeView } from "@/apps/split/home-view"
import { Skeleton } from "@/components/ui/skeleton"
import { useCategories, useExpenses, useMembers, usePayments } from "@/data/split"

const appRoute = getRouteApi("/_app")
const homeRoute = getRouteApi("/_app/split/")

/**
 * The Split App's home: Balances, Add Expense, Settle up, and the Activity, Balances and Spending
 * tabs, each Expense or Payment opening it and each suggested Payment opening Settle up filled in. The tab showing is in the address, so coming back to Home
 * returns to it.
 */
export function SplitHome() {
  const { session } = appRoute.useRouteContext()
  const { tab } = homeRoute.useSearch()
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
      tab={tab ?? "activity"}
      onTabChange={(next) =>
        void navigate({
          to: "/split",
          search: { tab: next === "activity" ? undefined : next },
          replace: true,
        })
      }
      onAddExpense={() => void navigate({ to: "/split/expenses/new" })}
      onSettleUp={() => void navigate({ to: "/split/payments/new" })}
      onSettleSuggestion={({ fromId, toId, amount }) =>
        void navigate({ to: "/split/payments/new", search: { fromId, toId, amount } })
      }
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

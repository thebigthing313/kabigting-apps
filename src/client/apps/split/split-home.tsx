import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { HomeView } from "@/apps/split/home-view"
import { Skeleton } from "@/components/ui/skeleton"
import { useCategories, useExpenses, useMembers } from "@/data/split"

const appRoute = getRouteApi("/_app")

/** The Split App's home: Balances, Add Expense and the Activity feed. */
export function SplitHome() {
  const { session } = appRoute.useRouteContext()
  const { data: expenses, isLoading } = useExpenses()
  const members = useMembers()
  const categories = useCategories()
  const navigate = useNavigate()
  if (isLoading || !members.data || !categories.data) {
    return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  }
  return (
    <HomeView
      viewerId={session.user.id}
      members={members.data}
      expenses={expenses}
      categories={categories.data}
      onAddExpense={() => void navigate({ to: "/split/expenses/new" })}
      onManageCategories={() => void navigate({ to: "/split/categories" })}
    />
  )
}

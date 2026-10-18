import { createFileRoute } from "@tanstack/react-router"
import { CategoryPage } from "@/apps/finances/categories/category-page"
import { UNCATEGORISED_PARAM } from "@/apps/finances/categories/category-route"
import { monthSearch } from "@/apps/finances/summary/month-search"

export const Route = createFileRoute("/_app/finances/categories/$categoryId")({
  validateSearch: monthSearch,
  component: CategoryRoute,
})

function CategoryRoute() {
  const { categoryId } = Route.useParams()
  const { month } = Route.useSearch()
  return (
    <CategoryPage
      categoryId={categoryId === UNCATEGORISED_PARAM ? null : categoryId}
      month={month}
    />
  )
}

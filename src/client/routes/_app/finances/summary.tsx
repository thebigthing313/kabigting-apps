import { createFileRoute } from "@tanstack/react-router"
import { monthSearch } from "@/apps/finances/summary/month-search"
import { SummaryPage } from "@/apps/finances/summary/summary-page"

export const Route = createFileRoute("/_app/finances/summary")({
  validateSearch: monthSearch,
  component: SummaryRoute,
})

function SummaryRoute() {
  const { month } = Route.useSearch()
  return <SummaryPage month={month} />
}

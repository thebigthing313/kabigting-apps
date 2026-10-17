import { createFileRoute } from "@tanstack/react-router"
import { FinancesHome } from "@/apps/finances/finances-home"

export const Route = createFileRoute("/_app/finances/")({
  component: FinancesHome,
})

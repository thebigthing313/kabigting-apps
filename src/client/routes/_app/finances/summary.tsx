import { createFileRoute } from "@tanstack/react-router"
import { SummaryPage } from "@/apps/finances/finances-home"

export const Route = createFileRoute("/_app/finances/summary")({
  component: SummaryPage,
})

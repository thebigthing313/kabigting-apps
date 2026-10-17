import { createFileRoute } from "@tanstack/react-router"
import { SummaryPage } from "@/apps/finances/placeholders"

export const Route = createFileRoute("/_app/finances/summary")({
  component: SummaryPage,
})

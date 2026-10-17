import { createFileRoute } from "@tanstack/react-router"
import { SchedulesPage } from "@/apps/finances/placeholders"

export const Route = createFileRoute("/_app/finances/schedules/")({
  component: SchedulesPage,
})

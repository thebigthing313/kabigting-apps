import { createFileRoute } from "@tanstack/react-router"
import { SchedulesPage } from "@/apps/finances/schedules/schedules-page"

export const Route = createFileRoute("/_app/finances/schedules/")({
  component: SchedulesPage,
})

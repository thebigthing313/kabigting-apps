import { createFileRoute } from "@tanstack/react-router"
import { SchedulesPage } from "@/apps/finances/finances-home"

export const Route = createFileRoute("/_app/finances/schedules/")({
  component: SchedulesPage,
})

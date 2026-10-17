import { createFileRoute } from "@tanstack/react-router"
import { SchedulePage } from "@/apps/finances/schedules/schedule-page"

export const Route = createFileRoute("/_app/finances/schedules/$scheduleId")({
  component: ScheduleRoute,
})

function ScheduleRoute() {
  const { scheduleId } = Route.useParams()
  return <SchedulePage scheduleId={scheduleId} />
}

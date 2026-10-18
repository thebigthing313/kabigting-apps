import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { SchedulePage } from "@/apps/finances/schedules/schedule-page"

export const Route = createFileRoute("/_app/finances/schedules/$scheduleId")({
  // `?occurrence=` opens that Occurrence's editor, by its nominal date; anything else is ignored.
  validateSearch: z.object({
    occurrence: z.iso.date().optional().catch(undefined),
  }),
  component: ScheduleRoute,
})

function ScheduleRoute() {
  const { scheduleId } = Route.useParams()
  const { occurrence } = Route.useSearch()
  return <SchedulePage scheduleId={scheduleId} occurrence={occurrence} />
}

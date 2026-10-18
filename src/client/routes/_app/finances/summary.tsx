import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { SummaryPage } from "@/apps/finances/summary/summary-page"

export const Route = createFileRoute("/_app/finances/summary")({
  // A malformed month falls back to the opening month rather than failing the page.
  validateSearch: z.object({
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional()
      .catch(undefined),
  }),
  component: SummaryRoute,
})

function SummaryRoute() {
  const { month } = Route.useSearch()
  return <SummaryPage month={month} />
}

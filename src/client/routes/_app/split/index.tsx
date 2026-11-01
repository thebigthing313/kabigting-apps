import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { HOME_TABS } from "@/apps/split/home-tab"
import { SplitHome } from "@/apps/split/split-home"

export const Route = createFileRoute("/_app/split/")({
  // `?tab=` picks Home's tab; an unknown one falls back to Activity rather than failing the page.
  validateSearch: z.object({
    tab: z.enum(HOME_TABS).optional().catch(undefined),
  }),
  component: SplitHome,
})

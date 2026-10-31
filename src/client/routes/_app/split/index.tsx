import { createFileRoute } from "@tanstack/react-router"
import { SplitHome } from "@/apps/split/split-home"

export const Route = createFileRoute("/_app/split/")({
  component: SplitHome,
})

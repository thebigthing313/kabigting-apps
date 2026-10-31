import { createFileRoute } from "@tanstack/react-router"
import { SettleUpPage } from "@/apps/split/settle-up-page"

export const Route = createFileRoute("/_app/split/payments/new")({
  component: SettleUpPage,
})

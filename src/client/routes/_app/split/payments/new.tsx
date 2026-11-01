import { createFileRoute } from "@tanstack/react-router"
import { SettleUpPage, settleUpSearch } from "@/apps/split/settle-up-page"

export const Route = createFileRoute("/_app/split/payments/new")({
  // A suggested Payment fills the form in; anything malformed is dropped rather than failing.
  validateSearch: settleUpSearch,
  component: SettleUpPage,
})

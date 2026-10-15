import { createFileRoute, redirect } from "@tanstack/react-router"
import { AccountsPage } from "@/shell/accounts/accounts-page"

export const Route = createFileRoute("/_app/admin/accounts")({
  // Only the Admin manages Accounts; the server refuses everyone else as well.
  beforeLoad: ({ context }) => {
    if (context.session.user.role !== "admin") throw redirect({ to: "/" })
  },
  component: AccountsPage,
})

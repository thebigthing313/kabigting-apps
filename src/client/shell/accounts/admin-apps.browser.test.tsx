import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { describe, expect, test } from "vitest"
import { render } from "vitest-browser-react"
import type { AdminAccount } from "@/data/admin-accounts"
import { AccountActionDialog } from "@/shell/accounts/account-actions"
import { AccountsTable } from "@/shell/accounts/accounts-table"

function withQueries(children: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

function account(overrides: Partial<AdminAccount>): AdminAccount {
  return {
    id: "someone",
    email: "someone@example.com",
    name: "Someone",
    role: "user",
    status: "active",
    apps: [],
    temporaryPassword: null,
    ...overrides,
  }
}

const admin = account({ id: "admin", email: "admin@example.com", name: "Admin", role: "admin" })
const guest = account({ id: "guest", email: "guest@example.com", name: "Guest" })

describe("the Admin on the Accounts screen", () => {
  test("an Admin's row shows All Apps; a Guest without Apps shows No Apps", async () => {
    const screen = await render(
      withQueries(<AccountsTable accounts={[admin, guest]} selfId="me" onAction={() => {}} />),
    )
    const rows = screen.getByRole("table").getByRole("row")
    const adminRow = rows.filter({ hasText: "admin@example.com" })
    const guestRow = rows.filter({ hasText: "guest@example.com" })
    await expect.element(adminRow.getByText("All Apps")).toBeInTheDocument()
    await expect.element(guestRow.getByText("No Apps")).toBeInTheDocument()
    await expect.element(guestRow.getByText("All Apps")).not.toBeInTheDocument()
  })

  test("the edit sheet offers no App checkboxes for an Admin", async () => {
    const screen = await render(
      withQueries(
        <AccountActionDialog target={{ action: "apps", account: admin }} onClose={() => {}} />,
      ),
    )
    await expect.element(screen.getByText("The Admin holds every App.")).toBeVisible()
    await expect.element(screen.getByRole("checkbox")).not.toBeInTheDocument()
    await expect.element(screen.getByRole("button", { name: "Save" })).not.toBeInTheDocument()
  })

  test("the edit sheet still offers App checkboxes for anyone else", async () => {
    const screen = await render(
      withQueries(
        <AccountActionDialog target={{ action: "apps", account: guest }} onClose={() => {}} />,
      ),
    )
    await expect.element(screen.getByRole("checkbox", { name: "Finances" })).toBeInTheDocument()
  })
})

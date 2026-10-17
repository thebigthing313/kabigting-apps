import "@/styles.css"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { beforeEach, describe, expect, test } from "vitest"
import { page } from "vitest/browser"
import { render } from "vitest-browser-react"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ShellSidebar, type SidebarAccount } from "@/shell/app-shell"
import type { AppKey } from "@shared/apps"

const someone: SidebarAccount = { name: "Member", email: "someone@example.com", role: "user" }
const admin: SidebarAccount = { name: "Admin", email: "admin@example.com", role: "admin" }

// Wide enough for the desktop sidebar; a phone gets the drawer instead.
beforeEach(async () => {
  await page.viewport(1280, 800)
})

/** Renders the sidebar alone at `path`, as the Shell would for this Account. */
async function renderAt(path: string, account: SidebarAccount, apps: AppKey[]) {
  const rootRoute = createRootRoute({
    component: () => (
      <TooltipProvider>
        <SidebarProvider>
          <SidebarTrigger />
          <ShellSidebar account={account} apps={apps} />
        </SidebarProvider>
      </TooltipProvider>
    ),
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  const screen = await render(<RouterProvider router={router} />)
  return { screen, router }
}

describe("at Home and on Admin pages", () => {
  test("lists Home and the Apps, with no App switcher", async () => {
    const { screen } = await renderAt("/", someone, ["finances"])
    await expect.element(screen.getByRole("link", { name: "Home" })).toBeVisible()
    await expect.element(screen.getByRole("link", { name: "Finances" })).toBeVisible()
    await expect
      .element(screen.getByRole("button", { name: /App switcher/ }))
      .not.toBeInTheDocument()
    await expect.element(screen.getByRole("link", { name: "Schedules" })).not.toBeInTheDocument()
    await expect.element(screen.getByRole("link", { name: "Accounts" })).not.toBeInTheDocument()
    await expect.element(screen.getByRole("link", { name: "Home" })).toHaveAttribute("data-active")
  })

  test("shows the Admin group to the Admin, active on its page", async () => {
    const { screen } = await renderAt("/admin/accounts", admin, ["finances"])
    const accountsLink = screen.getByRole("link", { name: "Accounts" })
    await expect.element(accountsLink).toHaveAttribute("data-active")
    await expect
      .element(screen.getByRole("link", { name: "Home" }))
      .not.toHaveAttribute("data-active")
    await expect.element(screen.getByRole("link", { name: "Finances" })).toBeVisible()
  })
})

describe("inside an App", () => {
  test("lists the App's sections under the App switcher, without the Admin group", async () => {
    const { screen } = await renderAt("/finances", admin, ["finances"])
    await expect
      .element(screen.getByRole("button", { name: /App switcher/ }))
      .toHaveTextContent("Finances")
    for (const name of ["Home", "Schedules", "Wallets", "Summary"])
      await expect.element(screen.getByRole("link", { name })).toBeVisible()
    await expect.element(screen.getByRole("link", { name: "Accounts" })).not.toBeInTheDocument()
    await expect
      .element(screen.getByRole("link", { name: "Home" }))
      .toHaveAttribute("href", "/finances")
    await expect.element(screen.getByRole("link", { name: "Home" })).toHaveAttribute("data-active")
    await expect
      .element(screen.getByRole("link", { name: "Schedules" }))
      .not.toHaveAttribute("data-active")
  })

  test("keeps a section active on its child pages, and Home not", async () => {
    const { screen } = await renderAt("/finances/schedules/some-schedule", someone, ["finances"])
    await expect
      .element(screen.getByRole("link", { name: "Schedules" }))
      .toHaveAttribute("data-active")
    await expect
      .element(screen.getByRole("link", { name: "Home" }))
      .not.toHaveAttribute("data-active")
    await expect
      .element(screen.getByRole("link", { name: "Wallets" }))
      .not.toHaveAttribute("data-active")
  })

  test("the App switcher lists Home and the Account's Apps, and goes there", async () => {
    const { screen, router } = await renderAt("/finances/wallets", someone, ["finances"])
    await screen.getByRole("button", { name: /App switcher/ }).click()
    const menu = screen.getByRole("menu")
    await expect.element(menu.getByRole("menuitem", { name: "Finances" })).toBeVisible()
    await menu.getByRole("menuitem", { name: "Home" }).click()
    await expect.poll(() => router.state.location.pathname).toBe("/")
    await expect
      .element(screen.getByRole("button", { name: /App switcher/ }))
      .not.toBeInTheDocument()
  })

  test("the App switcher says there are no Apps when there are none", async () => {
    const { screen } = await renderAt("/finances", someone, [])
    await screen.getByRole("button", { name: /App switcher/ }).click()
    await expect.element(screen.getByRole("menu").getByText("No Apps yet")).toBeVisible()
  })
})

describe("on a phone", () => {
  test("choosing a sidebar item closes the drawer", async () => {
    await page.viewport(390, 800)
    const { screen, router } = await renderAt("/finances", someone, ["finances"])
    await screen.getByRole("button", { name: "Toggle Sidebar" }).click()
    await screen.getByRole("link", { name: "Wallets" }).click()
    await expect.poll(() => router.state.location.pathname).toBe("/finances/wallets")
    await expect.element(screen.getByRole("link", { name: "Wallets" })).not.toBeInTheDocument()
  })
})

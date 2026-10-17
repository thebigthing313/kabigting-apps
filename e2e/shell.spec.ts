import type { Page } from "@playwright/test"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

function sidebar(page: Page) {
  return page.locator('[data-sidebar="sidebar"]')
}

/** The sidebar is always shown on desktop, and a drawer to open on phones. */
async function openSidebar(page: Page) {
  if (!(await sidebar(page).isVisible()))
    await page.getByRole("button", { name: "Toggle Sidebar" }).click()
  return sidebar(page)
}

test("the sidebar goes into an App, between its sections, and back Home", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name.endsWith("phone")
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Hello, Member" })).toBeVisible()

  // Home: the Apps, with no App switcher.
  let nav = await openSidebar(page)
  await expect(nav.getByRole("button", { name: /App switcher/ })).toHaveCount(0)
  await nav.getByRole("link", { name: "Finances" }).click()
  await expect(page).toHaveURL(/\/finances$/)
  await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible()
  if (phone) await expect(sidebar(page)).toBeHidden()

  // Inside Finances: its sections, the current one active.
  nav = await openSidebar(page)
  await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("data-active", "")
  await nav.getByRole("link", { name: "Schedules" }).click()
  await expect(page).toHaveURL(/\/finances\/schedules$/)
  await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible()
  if (phone) await expect(sidebar(page)).toBeHidden()

  // The App switcher goes back Home.
  nav = await openSidebar(page)
  await expect(nav.getByRole("link", { name: "Schedules" })).toHaveAttribute("data-active", "")
  await nav.getByRole("button", { name: /App switcher/ }).click()
  await page.getByRole("menuitem", { name: "Home" }).click()
  await expect(page.getByRole("heading", { name: "Hello, Member" })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

import type { Locator, Page } from "@playwright/test"
import { accounts, expect, openAccountMenu, signIn, test, useNewAddress } from "./fixtures.ts"

test("the Admin sees every Account on the Accounts screen", async ({ page }) => {
  const { admin, member, guest } = accounts()
  await signIn(page, admin.email, admin.password)
  await expect(page.getByRole("heading", { name: "Hello, Admin" })).toBeVisible()
  await page.goto("/admin/accounts")
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible()
  const list = page.getByRole("list", { name: "Accounts" }).or(page.getByRole("table"))
  await expect(list.filter({ visible: true })).toContainText(member.email)
  await expect(list.filter({ visible: true })).toContainText(guest.email)
})

test("anyone else is sent Home and never sees the Admin menu", async ({ page }) => {
  const { member } = accounts()
  await signIn(page, member.email, member.password)
  await expect(page.getByRole("heading", { name: "Hello, Member" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Accounts" })).toHaveCount(0)
  await page.goto("/admin/accounts")
  await expect(page.getByRole("heading", { name: "Hello, Member" })).toBeVisible()
  const response = await page.request.get("/api/admin/accounts")
  expect(response.status()).toBe(403)
  expect(await response.json()).toMatchObject({ error: { code: "forbidden_admin" } })
})

/** Signs out through the Account menu, waiting for the full page load that sign-out ends with. */
async function signOut(page: Page, name: string) {
  await openAccountMenu(page, name)
  const reloaded = page.waitForEvent("load")
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await reloaded
  await expect(page).toHaveURL(/\/sign-in/)
}

async function signInFresh(page: Page, email: string, password: string) {
  await useNewAddress(page)
  await signIn(page, email, password)
}

async function adminOpensAccounts(page: Page) {
  const { admin } = accounts()
  await signInFresh(page, admin.email, admin.password)
  await expect(page.getByRole("heading", { name: "Hello, Admin" })).toBeVisible()
  await page.goto("/admin/accounts")
  await expect(page.getByRole("heading", { name: "Accounts" })).toBeVisible()
}

/** Reveals the temporary password in an open dialog and reads it. */
async function readIssuedPassword(dialog: Locator) {
  const field = dialog.getByLabel("Temporary password")
  await expect(field).toHaveAttribute("type", "password")
  await dialog.getByRole("button", { name: "Show password" }).click()
  await expect(field).toHaveAttribute("type", "text")
  const password = await field.inputValue()
  await dialog.getByRole("button", { name: "Done" }).click()
  return password
}

async function replaceTemporaryPassword(page: Page, temporary: string, chosen: string) {
  await expect(page).toHaveURL(/\/change-password/)
  await page.getByLabel("Temporary password").fill(temporary)
  await page.getByLabel("New password", { exact: true }).fill(chosen)
  await page.getByLabel("Confirm new password").fill(chosen)
  await page.getByRole("button", { name: "Save password" }).click()
}

async function openActions(page: Page, email: string) {
  await page
    .getByRole("button", { name: `Actions for ${email}` })
    .filter({ visible: true })
    .click()
}

test("the Admin manages an Account from creation onwards", async ({ page }, testInfo) => {
  // Many sign-ins in one story; WebKit on a phone profile needs the extra time.
  test.slow()
  const email = `created-${testInfo.project.name}-${Date.now()}@example.com`

  // Create: the temporary password is hidden until shown, and stays on the row.
  await adminOpensAccounts(page)
  await page.getByRole("button", { name: "New Account" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Email").fill(email)
  await dialog.getByLabel("Name").fill("Created")
  await dialog.getByRole("checkbox", { name: "Notes" }).click()
  await dialog.getByRole("button", { name: "Create Account" }).click()
  await expect(dialog.getByRole("heading", { name: "Account created" })).toBeVisible()
  const firstPassword = await readIssuedPassword(dialog)
  await expect(
    page.getByLabel(`Temporary password for ${email}`).filter({ visible: true }),
  ).toHaveValue(firstPassword)
  await signOut(page, "Admin")

  // First sign-in forces a password change, then the granted App is there.
  await signInFresh(page, email, firstPassword)
  await replaceTemporaryPassword(page, firstPassword, "a-password-of-my-own")
  await expect(page.getByRole("heading", { name: "Hello, Created" })).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Notes/ }).filter({ visible: true }).first(),
  ).toBeVisible()
  await signOut(page, "Created")

  // Reset: a new temporary password replaces the one they chose.
  await adminOpensAccounts(page)
  await openActions(page, email)
  await page.getByRole("menuitem", { name: "Reset password" }).click()
  await expect(page.getByRole("alertdialog")).toContainText("Sign Created out everywhere")
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset password" }).click()
  const resetDialog = page.getByRole("dialog")
  await expect(resetDialog.getByRole("heading", { name: "Password reset" })).toBeVisible()
  const resetPassword = await readIssuedPassword(resetDialog)
  expect(resetPassword).not.toBe(firstPassword)
  await signOut(page, "Admin")

  await signInFresh(page, email, "a-password-of-my-own")
  await expect(page.getByText("That email and password do not match an Account.")).toBeVisible()
  await signInFresh(page, email, resetPassword)
  await replaceTemporaryPassword(page, resetPassword, "another-password-of-mine")
  await expect(page.getByRole("heading", { name: "Hello, Created" })).toBeVisible()
  await signOut(page, "Created")

  // Remove: sign-in is blocked. Restore: the same password works again.
  await adminOpensAccounts(page)
  const row = page
    .getByRole("listitem")
    .or(page.getByRole("row"))
    .filter({ hasText: email })
    .filter({ visible: true })
  await openActions(page, email)
  await page.getByRole("menuitem", { name: "Remove" }).click()
  await expect(page.getByRole("alertdialog")).toContainText("Their data is kept")
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click()
  await expect(row).toContainText("Removed")
  await signOut(page, "Admin")

  await signInFresh(page, email, "another-password-of-mine")
  await expect(page.getByText("That email and password do not match an Account.")).toBeVisible()

  await adminOpensAccounts(page)
  await openActions(page, email)
  await page.getByRole("menuitem", { name: "Restore" }).click()
  await expect(row).toContainText("Active")
  await signOut(page, "Admin")

  await signInFresh(page, email, "another-password-of-mine")
  await expect(page.getByRole("heading", { name: "Hello, Created" })).toBeVisible()
})

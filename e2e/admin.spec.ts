import { accounts, expect, openAccountMenu, signIn, test } from "./fixtures.ts"

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

test("the Admin creates an Account, which must replace its temporary password", async ({
  page,
}, testInfo) => {
  const { admin } = accounts()
  const email = `created-${testInfo.project.name}-${Date.now()}@example.com`
  await signIn(page, admin.email, admin.password)
  await expect(page.getByRole("heading", { name: "Hello, Admin" })).toBeVisible()
  await page.goto("/admin/accounts")

  await page.getByRole("button", { name: "New Account" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Email").fill(email)
  await dialog.getByLabel("Name").fill("Created")
  await dialog.getByRole("checkbox", { name: "Notes" }).click()
  await dialog.getByRole("button", { name: "Create Account" }).click()

  await expect(dialog.getByRole("heading", { name: "Account created" })).toBeVisible()
  const field = dialog.getByLabel("Temporary password")
  await expect(field).toHaveAttribute("type", "password")
  await dialog.getByRole("button", { name: "Show password" }).click()
  await expect(field).toHaveAttribute("type", "text")
  const password = await field.inputValue()
  await dialog.getByRole("button", { name: "Done" }).click()

  // The row keeps the password until the Account replaces it.
  const rowPassword = page.getByLabel(`Temporary password for ${email}`).filter({ visible: true })
  await expect(rowPassword).toHaveValue(password)

  await openAccountMenu(page, "Admin")
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/sign-in/)

  await signIn(page, email, password)
  await expect(page).toHaveURL(/\/change-password/)
  await page.getByLabel("Temporary password").fill(password)
  await page.getByLabel("New password", { exact: true }).fill("a-password-of-my-own")
  await page.getByLabel("Confirm new password").fill("a-password-of-my-own")
  await page.getByRole("button", { name: "Save password" }).click()
  await expect(page.getByRole("heading", { name: "Hello, Created" })).toBeVisible()
  await expect(
    page.getByRole("link", { name: /Notes/ }).filter({ visible: true }).first(),
  ).toBeVisible()
})

import { accounts, expect, signIn, test } from "./fixtures.ts"

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

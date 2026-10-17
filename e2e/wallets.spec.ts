import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

test("a Wallet can be added, have its Settings changed and be archived, surviving reloads", async ({
  page,
}, testInfo) => {
  const name = `E2E wallet ${testInfo.project.name} ${Date.now()}`
  await page.goto("/finances/wallets")
  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible()

  await page.getByRole("button", { name: "New Wallet" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Name").fill(name)
  await dialog.getByRole("button", { name: "Add Wallet" }).click()
  await expect(dialog).toBeHidden()
  const row = page.getByRole("link").filter({ hasText: name })
  await expect(row).toContainText("No Balance check · not in the forecast")

  await page.reload()
  await expect(row).toContainText("not in the forecast")

  // Settings: put it in the forecast with a threshold.
  await row.click()
  await expect(page.getByRole("heading", { name })).toBeVisible()
  await page.getByRole("link", { name: "Settings" }).click()
  await expect(page).toHaveURL(/tab=settings/)
  await page.getByText("In the forecast", { exact: true }).click()
  await page.getByLabel("Low-balance threshold").fill("100")
  await page.getByRole("button", { name: "Save settings" }).click()
  await expect(page.getByText("Settings saved")).toBeVisible()

  await page.reload()
  await expect(page.getByRole("checkbox", { name: "In the forecast" })).toBeChecked()
  await expect(page.getByLabel("Low-balance threshold")).toHaveValue("$100.00")

  // Archived Wallets hide behind the toggle.
  await page.getByRole("button", { name: "Archive Wallet" }).click()
  await expect(page.getByText("Wallet archived")).toBeVisible()
  await page.goto("/finances/wallets")
  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible()
  await expect(row).toHaveCount(0)
  await page.getByRole("checkbox", { name: /Show archived/ }).click()
  await expect(row).toContainText("No Balance check · archived")
})

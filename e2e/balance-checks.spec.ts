import { expect, MEMBER_STATE, runName, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

test("Balance checks are entered, compared with the computed balance and replaced by date", async ({
  page,
}, testInfo) => {
  const name = `E2E checked ${runName(testInfo)}`
  await page.goto("/finances/wallets")
  await page.getByRole("button", { name: "New Wallet" }).click()
  const newWallet = page.getByRole("dialog")
  await newWallet.getByLabel("Name").fill(name)
  await newWallet.getByRole("button", { name: "Add Wallet" }).click()
  await expect(newWallet).toBeHidden()
  await page.getByRole("link").filter({ hasText: name }).click()
  await page.getByRole("link", { name: "Balance checks" }).click()
  await expect(page).toHaveURL(/tab=checks/)
  await expect(page.getByText("No Balance checks yet.")).toBeVisible()

  async function enter(date: string, amount: string) {
    await page.getByRole("button", { name: "Enter Balance check" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByLabel("Wallet")).toHaveValue(/.+/)
    await dialog.getByLabel("Date").fill(date)
    await dialog.getByLabel("Balance").fill(amount)
    await dialog.getByRole("button", { name: "Save Balance check" }).click()
    await expect(dialog.getByRole("heading", { name: "Balance check saved" })).toBeVisible()
    return dialog
  }

  // The first check has nothing to compare with.
  let dialog = await enter("2026-10-01", "1000")
  await expect(dialog.getByText(/nothing to compare it with/)).toBeVisible()
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(dialog).toBeHidden()

  // A later one shows the computed balance and the difference; nothing is adjusted.
  dialog = await enter("2026-10-05", "950")
  await expect(dialog.getByText("$1,000.00")).toBeVisible()
  await expect(dialog.getByText("off by -$50.00")).toBeVisible()
  await dialog.getByRole("button", { name: "Done" }).click()

  const list = page.getByRole("list", { name: "Balance checks" })
  await expect(list.getByRole("listitem")).toHaveCount(2)
  await expect(list.getByRole("listitem").first()).toContainText("Oct 5, 2026")
  await expect(list.getByRole("listitem").first()).toContainText("off by -$50.00")
  await expect(page.getByText("$950.00").first()).toBeVisible()

  // Re-entering the same date replaces the check.
  dialog = await enter("2026-10-05", "1,000")
  await expect(dialog.getByText("None, it matches")).toBeVisible()
  await dialog.getByRole("button", { name: "Done" }).click()
  await page.reload()
  await expect(list.getByRole("listitem")).toHaveCount(2)
  await expect(list).not.toContainText("off by")
  await expect(page.getByText("Last Balance check Oct 5, 2026")).toBeVisible()

  // The Wallets list shows the balance from the latest check.
  await page.goto("/finances/wallets")
  await expect(page.getByRole("link").filter({ hasText: name })).toContainText(
    "$1,000.00 · checked Oct 5, 2026 · not in the forecast",
  )
})

import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

test("a monthly bill and a card payment Transfer are listed under their Wallet with their next date", async ({
  page,
}, testInfo) => {
  const run = `${testInfo.project.name} ${Date.now()}`
  const checking = `E2E checking ${run}`
  const card = `E2E card ${run}`
  for (const name of [checking, card]) {
    const response = await page.request.post("/api/finances/wallets", {
      data: { id: crypto.randomUUID(), name },
    })
    expect(response.status()).toBe(201)
  }

  await page.goto("/finances/schedules")
  await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible()

  // Rent on the 31st: money out, with a new Account and Category added inline.
  await page.getByRole("button", { name: "New Schedule" }).click()
  let dialog = page.getByRole("dialog")
  await dialog.getByLabel("Wallet", { exact: true }).selectOption({ label: checking })
  await dialog.getByLabel("Amount").fill("1,500")
  await dialog.getByLabel("Account", { exact: true }).fill(`E2E landlord ${run}`)
  await page.getByRole("option", { name: `Add "E2E landlord ${run}"` }).click()
  await dialog.getByLabel("Start date").fill("2031-01-31")
  // WebKit does not scroll the dialog's scroller to a field it fills; a person would.
  await dialog.getByLabel("Category", { exact: true }).scrollIntoViewIfNeeded()
  await dialog.getByLabel("Category", { exact: true }).fill(`E2E housing ${run}`)
  await page.getByRole("option", { name: `Add "E2E housing ${run}"` }).click()
  await dialog.getByRole("button", { name: "Add Schedule" }).click()
  await expect(dialog).toBeHidden()

  // A card payment every 2 weeks: a Transfer, which has no Category.
  await page.getByRole("button", { name: "New Schedule" }).click()
  dialog = page.getByRole("dialog")
  await dialog.getByLabel("Wallet", { exact: true }).selectOption({ label: checking })
  await dialog.getByText("A Transfer to a Wallet").click()
  await expect(dialog.getByLabel("Category", { exact: true })).toHaveCount(0)
  await dialog.getByLabel("Transfer to", { exact: true }).selectOption({ label: card })
  await dialog.getByLabel("Amount").fill("200")
  await dialog.getByLabel("Every").fill("2")
  await dialog.getByLabel("Weeks or months").selectOption("week")
  await dialog.getByLabel("Start date").fill("2031-01-03")
  await dialog.getByRole("button", { name: "Add Schedule" }).click()
  await expect(dialog).toBeHidden()

  const group = page.getByRole("region", { name: checking })
  const rows = group.getByRole("listitem")
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText(`Transfer to ${card}`)
  await expect(rows.nth(0)).toContainText("Every 2 weeks on Friday · next Jan 3, 2031")
  await expect(rows.nth(0)).toContainText("-$200.00")
  await expect(rows.nth(1)).toContainText(`E2E landlord ${run}`)
  await expect(rows.nth(1)).toContainText("Monthly on the 31st · next Jan 31, 2031")
  await expect(rows.nth(1)).toContainText("-$1,500.00")

  await page.reload()
  await expect(page.getByRole("region", { name: checking }).getByRole("listitem")).toHaveCount(2)
})

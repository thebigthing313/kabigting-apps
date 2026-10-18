import type { Page } from "@playwright/test"
import { addDays, formatDisplayDate, today } from "../src/shared/dates.ts"
import { expect, MEMBER_STATE, runName, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID()
  const response = await page.request.post(`/api/finances/${path}`, { data: { id, ...data } })
  expect(response.status()).toBe(201)
  return id
}

test("an Actual Transfer shows once in each Wallet's Activity, never as spending or income", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = runName(testInfo)
  const checking = `E2E transfer checking ${run}`
  const card = `E2E transfer card ${run}`
  const checkingId = await post(page, "wallets", { name: checking })
  const cardId = await post(page, "wallets", { name: card, shownAsOwed: true })
  const checkDate = addDays(today(), -3)
  await post(page, "balance-checks", {
    walletId: checkingId,
    date: checkDate,
    amountCents: 100_000,
  })
  await post(page, "balance-checks", { walletId: cardId, date: checkDate, amountCents: -50_000 })

  // Add Actual, then "Transfer to…" the card: no direction and no Category to pick.
  await page.goto(`/finances/wallets/${checkingId}`)
  await expect(page.getByText("$1,000.00")).toBeVisible()
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: "Add Actual" }).click()
  let dialog = page.getByRole("dialog")
  await dialog.getByText("Transfer to…").click()
  await expect(dialog.getByText("Money out")).toBeHidden()
  await expect(dialog.getByLabel("Category")).toBeHidden()
  await dialog.getByLabel("To Wallet").selectOption({ label: card })
  await dialog.getByLabel("Amount").fill("250")
  await dialog.getByLabel("Note").scrollIntoViewIfNeeded()
  await dialog.getByLabel("Note").fill(`E2E card payment ${run}`)
  await dialog.getByRole("button", { name: "Add Actual Transfer" }).click()
  await expect(dialog).toBeHidden()

  // Out of checking: listed once, as a Transfer to the card, and the balance counts it.
  let actuals = page.getByRole("list", { name: "Actuals" })
  let row = actuals.getByRole("button").filter({ hasText: `Transfer to ${card}` })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(`${formatDisplayDate(today())} · Transfer`)
  await expect(row).not.toContainText("Uncategorised")
  await expect(row).toContainText("-$250.00")
  await expect(page.getByText("$750.00")).toBeVisible()

  // Into the card: listed once, as a Transfer from checking, paying down what's owed.
  await page.goto(`/finances/wallets/${cardId}`)
  actuals = page.getByRole("list", { name: "Actuals" })
  row = actuals.getByRole("button").filter({ hasText: `Transfer from ${checking}` })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText("-$250.00")
  await expect(page.getByText("$250.00 owed")).toBeVisible()

  // Its editor has no Category either, and deleting it takes it off both Wallets.
  await row.click()
  dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Edit Actual Transfer" })).toBeVisible()
  await expect(dialog.getByLabel("To Wallet")).toHaveValue(cardId)
  await expect(dialog.getByLabel("Category")).toBeHidden()
  await dialog.getByRole("button", { name: "Delete Actual Transfer" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByText("$500.00 owed")).toBeVisible()
  await page.goto(`/finances/wallets/${checkingId}`)
  await expect(page.getByText("No Actuals yet.")).toBeVisible()
})

test("Planned Transfers count in both Wallets' Forecasts, Overdue ones today", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = runName(testInfo)
  const checking = `E2E forecast checking ${run}`
  const savings = `E2E forecast savings ${run}`
  const checkingId = await post(page, "wallets", { name: checking, inForecast: true })
  const savingsId = await post(page, "wallets", { name: savings, inForecast: true })
  const checkDate = addDays(today(), -10)
  for (const walletId of [checkingId, savingsId]) {
    await post(page, "balance-checks", { walletId, date: checkDate, amountCents: 100_000 })
  }
  // Overdue since the checks, so counted today on both.
  await post(page, "transfers", {
    status: "planned",
    fromWalletId: checkingId,
    toWalletId: savingsId,
    date: addDays(today(), -2),
    amountCents: 10_000,
  })

  // A later one, entered from the + button as a Planned Transfer.
  const later = addDays(today(), 5)
  await page.goto(`/finances?wallet=${checkingId}`)
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: "Add one-off Planned" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByText("Transfer to…").click()
  await dialog.getByLabel("To Wallet").selectOption({ label: savings })
  await dialog.getByLabel("Date").fill(later)
  await dialog.getByLabel("Amount").fill("300")
  await dialog.getByRole("button", { name: "Add Planned Transfer" }).click()
  await expect(dialog).toBeHidden()

  const days = page.getByRole("list", { name: "Day by day" })
  const todayRow = days.getByRole("listitem").first()
  const laterRow = days.getByRole("listitem").filter({ hasText: formatDisplayDate(later) })
  await expect(todayRow).toContainText(
    `Transfer to ${savings} · Overdue since ${formatDisplayDate(addDays(today(), -2))}`,
  )
  await expect(todayRow).toContainText("-$100.00")
  await expect(todayRow).toContainText("$900.00")
  await expect(laterRow).toContainText(`Transfer to ${savings}`)
  await expect(laterRow).toContainText("$600.00")

  await page.goto(`/finances?wallet=${savingsId}`)
  await expect(todayRow).toContainText(`Transfer from ${checking} · Overdue since`)
  await expect(todayRow).toContainText("+$100.00")
  await expect(todayRow).toContainText("$1,100.00")
  await expect(laterRow).toContainText("+$300.00")
  await expect(laterRow).toContainText("$1,400.00")

  // Both Wallets list them under Upcoming one-offs.
  await page.goto(`/finances/wallets/${savingsId}`)
  const upcoming = page.getByRole("list", { name: "Upcoming one-offs" })
  await expect(upcoming.getByRole("button")).toHaveCount(2)
  await expect(upcoming.getByRole("button").first()).toContainText(`Transfer from ${checking}`)
  await expect(upcoming.getByRole("button").first()).toContainText("Overdue")
})

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

/** Opens the + button's menu and picks one of its actions. */
async function add(page: Page, action: string) {
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: action }).click()
  return page.getByRole("dialog")
}

test("an Actual added from a Wallet's + button shows in its Activity and can be edited and deleted", async ({
  page,
}, testInfo) => {
  const run = runName(testInfo)
  const walletId = await post(page, "wallets", { name: `E2E activity ${run}` })
  await post(page, "balance-checks", { walletId, date: addDays(today(), -3), amountCents: 100_000 })
  await page.goto(`/finances/wallets/${walletId}`)
  await expect(page.getByText("$1,000.00")).toBeVisible()
  await expect(page.getByText("No Actuals yet.")).toBeVisible()

  // Add Actual starts on this Wallet and today.
  let dialog = await add(page, "Add Actual")
  await expect(dialog.getByLabel("Wallet")).toHaveValue(walletId)
  await expect(dialog.getByLabel("Date")).toHaveValue(today())
  await dialog.getByLabel("Amount").fill("42.50")
  await dialog.getByLabel("Note").scrollIntoViewIfNeeded()
  await dialog.getByLabel("Note").fill(`E2E groceries ${run}`)
  await dialog.getByRole("button", { name: "Add Actual" }).click()
  await expect(dialog).toBeHidden()

  // Its row shows the date, label, Category and amount, and the balance counts it.
  const actuals = page.getByRole("list", { name: "Actuals" })
  const row = actuals.getByRole("button").filter({ hasText: `E2E groceries ${run}` })
  await expect(row).toContainText(formatDisplayDate(today()))
  await expect(row).toContainText("Uncategorised")
  await expect(row).toContainText("-$42.50")
  await expect(page.getByText("$957.50")).toBeVisible()

  // The editor changes its amount and date.
  await row.click()
  dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Edit Actual" })).toBeVisible()
  await dialog.getByLabel("Amount").fill("40")
  await dialog.getByLabel("Date").fill(addDays(today(), -1))
  await dialog.getByRole("button", { name: "Save changes" }).click()
  await expect(dialog).toBeHidden()
  await expect(row).toContainText("-$40.00")
  await expect(row).toContainText(formatDisplayDate(addDays(today(), -1)))
  await page.reload()
  await expect(row).toContainText("-$40.00")
  await expect(page.getByText("$960.00")).toBeVisible()

  // And deletes it.
  await row.click()
  await page.getByRole("dialog").getByRole("button", { name: "Delete Actual" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
  await expect(row).toHaveCount(0)
  await expect(page.getByText("No Actuals yet.")).toBeVisible()
  await expect(page.getByText("$1,000.00")).toBeVisible()
})

test("one-off Planned items land in the Forecast, Overdue ones today, and are edited from Activity", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = runName(testInfo)
  const name = `E2E one-offs ${run}`
  const walletId = await post(page, "wallets", { name, inForecast: true })
  const checkDate = addDays(today(), -10)
  await post(page, "balance-checks", { walletId, date: checkDate, amountCents: 100_000 })
  // Overdue since the check, so counted today; and one before the check, which it includes.
  await post(page, "transactions", {
    status: "planned",
    walletId,
    date: addDays(today(), -2),
    amountCents: -3_000,
    note: `E2E overdue ${run}`,
  })
  await post(page, "transactions", {
    status: "planned",
    walletId,
    date: addDays(checkDate, -1),
    amountCents: -9_900,
    note: `E2E before check ${run}`,
  })

  // Add one-off Planned from home's + button starts on the selected Wallet.
  await page.goto(`/finances?wallet=${walletId}`)
  const later = addDays(today(), 5)
  const dialog = await add(page, "Add one-off Planned")
  await expect(dialog.getByLabel("Wallet")).toHaveValue(walletId)
  await expect(dialog.getByRole("radio", { name: "Planned" })).toBeChecked()
  await dialog.getByLabel("Date").fill(later)
  await dialog.getByText("Money in").click()
  await dialog.getByLabel("Amount").fill("200")
  await dialog.getByLabel("Note").scrollIntoViewIfNeeded()
  await dialog.getByLabel("Note").fill(`E2E refund ${run}`)
  await dialog.getByRole("button", { name: "Add Planned" }).click()
  await expect(dialog).toBeHidden()

  const days = page.getByRole("list", { name: "Day by day" })
  const todayRow = days.getByRole("listitem").first()
  await expect(todayRow).toContainText(
    `E2E overdue ${run} · Overdue since ${formatDisplayDate(addDays(today(), -2))}`,
  )
  await expect(todayRow).toContainText("$970.00")
  const laterRow = days.getByRole("listitem").filter({ hasText: formatDisplayDate(later) })
  await expect(laterRow).toContainText(`E2E refund ${run}`)
  await expect(laterRow).toContainText("+$200.00")
  await expect(laterRow).toContainText("$1,170.00")
  await expect(days).not.toContainText(`E2E before check ${run}`)

  // On the Wallet's Activity, Upcoming one-offs lists them, soonest first.
  await page.goto(`/finances/wallets/${walletId}`)
  const upcoming = page.getByRole("list", { name: "Upcoming one-offs" })
  await expect(upcoming.getByRole("button")).toHaveCount(3)
  await expect(upcoming.getByRole("button").nth(1)).toContainText(`E2E overdue ${run}`)
  await expect(upcoming.getByRole("button").nth(1)).toContainText("Overdue")

  // Editing one moves it on the Forecast; deleting one takes it off.
  await upcoming
    .getByRole("button")
    .filter({ hasText: `E2E refund ${run}` })
    .click()
  let editor = page.getByRole("dialog")
  await expect(editor.getByRole("heading", { name: "Edit Planned" })).toBeVisible()
  await editor.getByLabel("Amount").fill("250")
  await editor.getByRole("button", { name: "Save changes" }).click()
  await expect(editor).toBeHidden()
  await expect(upcoming).toContainText("+$250.00")

  await upcoming
    .getByRole("button")
    .filter({ hasText: `E2E overdue ${run}` })
    .click()
  editor = page.getByRole("dialog")
  await editor.getByRole("button", { name: "Delete Planned" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
  await expect(upcoming.getByRole("button")).toHaveCount(2)

  await page.goto(`/finances?wallet=${walletId}`)
  await expect(todayRow).not.toContainText(`E2E overdue ${run}`)
  await expect(laterRow).toContainText("$1,250.00")
})

test("the + button offers Enter Balance check on the selected Wallet", async ({
  page,
}, testInfo) => {
  const walletId = await post(page, "wallets", {
    name: `E2E plus check ${runName(testInfo)}`,
  })
  await page.goto(`/finances/wallets/${walletId}`)
  const dialog = await add(page, "Enter Balance check")
  await expect(dialog.getByLabel("Wallet")).toHaveValue(walletId)
  await dialog.getByLabel("Balance").fill("500")
  await dialog.getByRole("button", { name: "Save Balance check" }).click()
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(page.getByText("$500.00")).toBeVisible()
})

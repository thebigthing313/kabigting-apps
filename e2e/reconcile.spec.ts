import type { Page } from "@playwright/test"
import { addDays, formatDisplayDate, today } from "../src/shared/dates.ts"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

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

test("an Actual added with a suggested match Reconciles it, taking its Category, and it leaves the Forecast", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = `${testInfo.project.name} ${Date.now()}`
  const walletId = await post(page, "wallets", { name: `E2E reconcile ${run}`, inForecast: true })
  await post(page, "balance-checks", {
    walletId,
    date: addDays(today(), -10),
    amountCents: 500_000,
  })
  const category = `E2E housing ${run}`
  const categoryId = await post(page, "categories", { name: category })
  // Overdue since two days ago, so counted today until it is Reconciled.
  const due = addDays(today(), -2)
  const scheduleId = await post(page, "schedules", {
    walletId,
    amountCents: -150_000,
    unit: "month",
    every: 1,
    startDate: due,
    categoryId,
    note: `E2E rent ${run}`,
  })

  await page.goto(`/finances?wallet=${walletId}`)
  const days = page.getByRole("list", { name: "Day by day" })
  await expect(days.getByRole("listitem").first()).toContainText(`E2E rent ${run}`)

  await page.goto(`/finances/wallets/${walletId}`)
  const dialog = await add(page, "Add Actual")
  await dialog.getByLabel("Amount").fill("1,480")
  const match = dialog.getByRole("checkbox", { name: new RegExp(`E2E rent ${run}`) })
  await expect(match).toBeVisible()
  await expect(dialog.getByRole("list", { name: "Planned matches" })).toContainText("-$1,500.00")
  await match.click()
  await expect(match).toBeChecked()
  await dialog.getByRole("button", { name: "Add Actual" }).click()
  await expect(dialog).toBeHidden()

  // The Actual's own amount stands, and it takes the Schedule's Category.
  const row = page.getByRole("list", { name: "Actuals" }).getByRole("button").first()
  await expect(row).toContainText(`Reconciled to E2E rent ${run}`)
  await expect(row).toContainText(category)
  await expect(row).toContainText("-$1,480.00")

  // On the Schedule, the Occurrence shows Reconciled at the Actual's amount, and isn't editable.
  await page.goto(`/finances/schedules/${scheduleId}`)
  const occurrence = page.getByRole("listitem", { name: formatDisplayDate(due) })
  await expect(occurrence).toContainText("Reconciled")
  await expect(occurrence).toContainText("-$1,480.00")
  await expect(occurrence.getByRole("link")).toHaveAttribute("href", /tab=activity/)

  // And it no longer counts in the Forecast.
  await page.goto(`/finances?wallet=${walletId}`)
  await expect(days.getByRole("listitem").first()).not.toContainText(`E2E rent ${run}`)
  await expect(days.getByRole("listitem").first()).toContainText("$3,520.00")
})

test("from Activity an Actual is Reconciled to any outstanding Planned item, and Un-Reconciled", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = `${testInfo.project.name} ${Date.now()}`
  const walletId = await post(page, "wallets", { name: `E2E pick ${run}` })
  // Three weeks out: too far to be suggested, but it can still be picked.
  await post(page, "transactions", {
    status: "planned",
    walletId,
    date: addDays(today(), 21),
    amountCents: -3_000,
    note: `E2E repair ${run}`,
  })
  await post(page, "transactions", {
    status: "actual",
    walletId,
    date: today(),
    amountCents: -2_900,
    note: `E2E repair paid ${run}`,
  })

  await page.goto(`/finances/wallets/${walletId}`)
  const upcoming = page.getByRole("list", { name: "Upcoming one-offs" })
  await expect(upcoming).toContainText(`E2E repair ${run}`)
  const row = page
    .getByRole("list", { name: "Actuals" })
    .getByRole("button")
    .filter({ hasText: `E2E repair paid ${run}` })
  await row.click()

  let editor = page.getByRole("dialog")
  await editor.getByRole("button", { name: "Reconcile to Planned…" }).click()
  const choices = editor.getByRole("list", { name: "Outstanding Planned" })
  await choices
    .getByRole("button")
    .filter({ hasText: `E2E repair ${run}` })
    .click()
  await expect(editor).toBeHidden()
  await expect(row).toContainText(`Reconciled to E2E repair ${run}`)
  await expect(page.getByText("No one-off Planned items.")).toBeVisible()

  // Un-Reconcile puts it back to outstanding at its own amount.
  await row.click()
  editor = page.getByRole("dialog")
  await expect(editor).toContainText(`Reconciled to E2E repair ${run}`)
  await editor.getByRole("button", { name: "Un-Reconcile" }).click()
  await expect(editor).toBeHidden()
  await expect(row).not.toContainText("Reconciled")
  await expect(upcoming).toContainText(`E2E repair ${run}`)
  await expect(upcoming).toContainText("-$30.00")
})

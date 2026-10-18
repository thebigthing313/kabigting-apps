import type { Page } from "@playwright/test"
import { formatMonth, shiftMonth, thisMonth } from "../src/shared/dates.ts"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID()
  const response = await page.request.post(`/api/finances/${path}`, { data: { id, ...data } })
  expect(response.status()).toBe(201)
  return id
}

test("a Category page opens from the summary, merges into another and returns to the month", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = `${testInfo.project.name} ${Date.now()}`
  const lastMonth = shiftMonth(thisMonth(), -1)

  const walletId = await post(page, "wallets", { name: `E2E category wallet ${run}` })
  const takeaway = `E2E takeaway ${run}`
  const dining = `E2E dining ${run}`
  const takeawayId = await post(page, "categories", { name: takeaway })
  const diningId = await post(page, "categories", { name: dining })
  const actual = (date: string, amountCents: number, categoryId: string | null) =>
    post(page, "transactions", { status: "actual", walletId, date, amountCents, categoryId })
  await actual(`${lastMonth}-04`, -2_000, takeawayId)
  await actual(`${lastMonth}-09`, -3_000, diningId)
  await post(page, "schedules", {
    walletId,
    amountCents: -1_500,
    unit: "month",
    every: 1,
    startDate: `${lastMonth}-01`,
    categoryId: takeawayId,
  })

  // Tapping a Category on the summary opens its page for that month.
  await page.goto(`/finances/summary?month=${lastMonth}`)
  const spending = page.getByRole("list", { name: "Spending Categories" })
  await spending.getByRole("link").filter({ hasText: takeaway }).click()
  await expect(page).toHaveURL(
    new RegExp(`/finances/categories/${takeawayId}\\?month=${lastMonth}`),
  )
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(takeaway)
  await expect(page.getByRole("img", { name: /Monthly net for the 12 months/ })).toBeVisible()
  const actuals = page.getByRole("list", { name: "Actuals" })
  await expect(actuals.getByRole("listitem")).toHaveCount(1)
  await expect(actuals).toContainText("-$20.00")

  // Merge names what moves, then moves it and opens the target.
  await page.getByRole("button", { name: "Merge into…" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Merge into").selectOption({ label: dining })
  await expect(dialog).toContainText(`Moves 1 Transaction and 1 Schedule to ${dining}.`)
  await dialog.getByRole("button", { name: "Merge" }).click()
  await expect(page).toHaveURL(new RegExp(`/finances/categories/${diningId}\\?month=${lastMonth}`))
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(dining)
  await expect(actuals.getByRole("listitem")).toHaveCount(2)

  // Back to the month, where the merged Category counts under its target.
  await page.getByRole("link", { name: formatMonth(lastMonth) }).click()
  await expect(page).toHaveURL(new RegExp(`/finances/summary\\?month=${lastMonth}`))
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(formatMonth(lastMonth))
  await expect(spending.getByRole("listitem").filter({ hasText: dining })).toContainText("-$50.00")
  await expect(spending.getByRole("listitem").filter({ hasText: takeaway })).toHaveCount(0)

  // The source is archived as merged and points at its target.
  await page.goto(`/finances/categories/${takeawayId}?month=${lastMonth}`)
  await expect(page.getByText("Merged", { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: dining })).toBeVisible()
  await expect(page.getByRole("button", { name: "Merge into…" })).toHaveCount(0)
})

test("Uncategorised has a page but no actions", async ({ page }, testInfo) => {
  const run = `${testInfo.project.name} ${Date.now()}`
  const lastMonth = shiftMonth(thisMonth(), -1)
  const walletId = await post(page, "wallets", { name: `E2E uncategorised wallet ${run}` })
  const note = `E2E no category ${run}`
  await post(page, "transactions", {
    status: "actual",
    walletId,
    date: `${lastMonth}-12`,
    amountCents: -700,
    note,
  })

  await page.goto(`/finances/categories/uncategorised?month=${lastMonth}`)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Uncategorised")
  await expect(page.getByRole("list", { name: "Actuals" })).toContainText(note)
  await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0)
})

import type { Page } from "@playwright/test"
import { addDays, addMonthsClamped, formatDisplayDate, today } from "../src/shared/dates.ts"
import { expect, MEMBER_STATE, runName, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID()
  const response = await page.request.post(`/api/finances/${path}`, { data: { id, ...data } })
  expect(response.status()).toBe(201)
  return id
}

test("an Occurrence is overridden, skipped, then put back on its Schedule", async ({
  page,
}, testInfo) => {
  const run = runName(testInfo)
  const checking = `E2E checking ${run}`
  const walletId = await post(page, "wallets", { name: checking })
  // Monthly, starting next month, so its first two Occurrences are upcoming. The second is a
  // month after the first, as the Schedule counts it: from Nov 30, that is Dec 30, not Dec 31.
  const first = addMonthsClamped(today(), 1)
  const second = addMonthsClamped(first, 1)
  await post(page, "schedules", {
    walletId,
    amountCents: -150_000,
    unit: "month",
    every: 1,
    startDate: first,
    note: `E2E rent ${run}`,
  })

  await page.goto("/finances/schedules")
  await page.getByRole("region", { name: checking }).getByRole("link").click()
  await expect(page.getByRole("heading", { name: `E2E rent ${run}` })).toBeVisible()

  const occurrence = (date: string) =>
    page.getByRole("listitem", { name: formatDisplayDate(date), exact: true })

  // A new amount on the first.
  await occurrence(first).getByRole("button").first().click()
  await occurrence(first).getByLabel("Amount").fill("1,575")
  await occurrence(first).getByRole("button", { name: "Save" }).click()
  await expect(occurrence(first).getByLabel("Amount")).toBeHidden()
  await expect(occurrence(first)).toContainText("Overridden")
  await expect(occurrence(first)).toContainText("-$1,575.00")

  // Skip the second.
  await occurrence(second).getByRole("button").first().click()
  await occurrence(second).getByRole("button", { name: "Skip" }).click()
  await expect(occurrence(second)).toContainText("Skipped")

  // Both are stored: they survive a reload, and the list's next Occurrence has the new amount.
  await page.reload()
  await expect(occurrence(first)).toContainText("Overridden")
  await expect(occurrence(second)).toContainText("Skipped")
  await page.goto("/finances/schedules")
  await expect(page.getByRole("region", { name: checking })).toContainText("-$1,575.00")
  await page.getByRole("region", { name: checking }).getByRole("link").click()

  // Back to schedule, and Unskip.
  await occurrence(first).getByRole("button").first().click()
  await occurrence(first).getByRole("button", { name: "Back to schedule" }).click()
  await expect(occurrence(first)).not.toContainText("Overridden")
  await expect(occurrence(first)).toContainText("-$1,500.00")
  await occurrence(second).getByRole("button").first().click()
  await occurrence(second).getByRole("button", { name: "Unskip" }).click()
  await expect(occurrence(second)).not.toContainText("Skipped")
  await page.reload()
  await expect(occurrence(first)).not.toContainText("Overridden")
  await expect(occurrence(second)).not.toContainText("Skipped")
})

test("a card payment's Occurrence takes the statement balance and due date", async ({
  page,
}, testInfo) => {
  const run = runName(testInfo)
  const checking = await post(page, "wallets", { name: `E2E checking ${run}` })
  const card = `E2E card ${run}`
  const cardId = await post(page, "wallets", { name: card, shownAsOwed: true })
  const first = addMonthsClamped(today(), 1)
  await post(page, "schedules", {
    walletId: checking,
    toWalletId: cardId,
    amountCents: 20_000,
    unit: "month",
    every: 1,
    startDate: first,
  })

  await page.goto("/finances/schedules")
  await page.getByRole("link", { name: new RegExp(`Transfer to ${card}`) }).click()
  await expect(page.getByRole("heading", { name: `Transfer to ${card}` })).toBeVisible()

  const row = page.getByRole("listitem", { name: formatDisplayDate(first), exact: true })
  await row.getByRole("button").first().click()
  await row.getByLabel("Statement balance").fill("482.10")
  const due = addDays(first, -2)
  await row.getByLabel("Due date").fill(due)
  await row.getByRole("button", { name: "Save" }).click()

  const moved = page.getByRole("listitem", { name: formatDisplayDate(due), exact: true })
  await expect(moved).toContainText("Overridden")
  await expect(moved).toContainText(`Moved from ${formatDisplayDate(first)}`)
  await expect(moved).toContainText("-$482.10")
})

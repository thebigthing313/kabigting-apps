import type { Page } from "@playwright/test"
import { addDays, addMonthsClamped, formatDisplayDate, today } from "../src/shared/dates.ts"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID()
  const response = await page.request.post(`/api/finances/${path}`, { data: { id, ...data } })
  expect(response.status()).toBe(201)
  return id
}

test("a Schedule changes from a date, ends, reopens and keeps its History", async ({
  page,
}, testInfo) => {
  const run = `${testInfo.project.name} ${Date.now()}`
  const checking = `E2E checking ${run}`
  const walletId = await post(page, "wallets", { name: checking })
  // Rent on the 1st, from two months ago; it goes up from the 1st two months ahead.
  const start = `${addMonthsClamped(today(), -2).slice(0, 7)}-01`
  const change = addMonthsClamped(start, 4)
  const later = addMonthsClamped(start, 5)
  const scheduleId = await post(page, "schedules", {
    walletId,
    amountCents: -150_000,
    unit: "month",
    every: 1,
    startDate: start,
    note: `E2E rent ${run}`,
  })
  await post(page, "occurrences", { scheduleId, nominalDate: later, overrideAmountCents: -157_500 })

  await page.goto(`/finances/schedules/${scheduleId}`)
  await expect(page.getByRole("heading", { name: `E2E rent ${run}` })).toBeVisible()
  const occurrence = (date: string) =>
    page.getByRole("listitem", { name: formatDisplayDate(date), exact: true })
  const history = page.getByRole("region", { name: "History" }).getByRole("listitem")

  // Change from a date: earlier Occurrences keep the old amount; the override moves along.
  await page.getByRole("button", { name: "Change from a date…" }).click()
  let dialog = page.getByRole("dialog")
  await dialog.getByLabel("Change from").fill(change)
  await dialog.getByLabel("Amount").fill("1,600")
  await dialog.getByRole("button", { name: "Change Schedule" }).click()
  await expect(dialog).toBeHidden()
  await expect(history).toHaveCount(2)
  await expect(history.nth(0)).toContainText(`${formatDisplayDate(change)} – no end date`)
  await expect(history.nth(0)).toContainText("-$1,600.00")
  await expect(history.nth(1)).toContainText(formatDisplayDate(addDays(change, -1)))
  await expect(history.nth(1)).toContainText("-$1,500.00")
  await expect(occurrence(addMonthsClamped(start, 3))).toContainText("-$1,500.00")
  await expect(occurrence(change)).toContainText("-$1,600.00")
  await expect(occurrence(later)).toContainText("Overridden")

  // The chain is one row in the list.
  await page.goto("/finances/schedules")
  const rows = page.getByRole("region", { name: checking }).getByRole("listitem")
  await expect(rows).toHaveCount(1)
  await rows.getByRole("link").click()
  await expect(history).toHaveCount(2)

  // End on the change date: the confirm lists the later override it deletes.
  await page.getByRole("button", { name: "End…" }).click()
  dialog = page.getByRole("dialog")
  await dialog.getByLabel("Last day").fill(change)
  await expect(dialog.getByRole("listitem")).toHaveCount(1)
  await expect(dialog.getByRole("listitem")).toContainText(formatDisplayDate(later))
  await dialog.getByRole("button", { name: "End Schedule" }).click()
  await expect(dialog).toBeHidden()
  await expect(occurrence(later)).toHaveCount(0)
  await expect(history.nth(0)).toContainText(
    `${formatDisplayDate(change)} – ${formatDisplayDate(change)}`,
  )

  // Reopen clears the end date; the deleted override stays gone.
  await page.getByRole("button", { name: "Reopen" }).click()
  await expect(page.getByRole("button", { name: "End…" })).toBeVisible()
  await expect(occurrence(later)).toContainText("-$1,600.00")
  await expect(occurrence(later)).not.toContainText("Overridden")
  await page.reload()
  await expect(history.nth(0)).toContainText("no end date")
})

test("an ended Schedule sits in the Ended group until it is deleted", async ({
  page,
}, testInfo) => {
  const run = `${testInfo.project.name} ${Date.now()}`
  const walletId = await post(page, "wallets", { name: `E2E checking ${run}` })
  const scheduleId = await post(page, "schedules", {
    walletId,
    amountCents: -5_000,
    unit: "week",
    every: 1,
    startDate: addDays(today(), -30),
    note: `E2E gym ${run}`,
  })

  await page.goto(`/finances/schedules/${scheduleId}`)
  await page.getByRole("button", { name: "End…" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Last day").fill(addDays(today(), -1))
  await expect(dialog).toContainText("No overrides will be deleted.")
  await dialog.getByRole("button", { name: "End Schedule" }).click()
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible()

  await page.goto("/finances/schedules")
  const ended = page.getByRole("region", { name: "Ended" })
  await expect(ended.getByRole("listitem").filter({ hasText: `E2E gym ${run}` })).toContainText(
    `ended ${formatDisplayDate(addDays(today(), -1))}`,
  )

  await ended.getByRole("link", { name: new RegExp(`E2E gym ${run}`) }).click()
  await page.getByRole("button", { name: "Delete…" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
  await expect(page.getByRole("heading", { name: "Schedules" })).toBeVisible()
  await expect(page.getByText(`E2E gym ${run}`)).toHaveCount(0)
})

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

import type { Page } from "@playwright/test"
import { addDays, addMonthsClamped, formatDisplayDate, today } from "../src/shared/dates.ts"
import { expect, MEMBER_STATE, runName, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

async function addSchedule(
  page: Page,
  schedule: { wallet: string; amount: string; note: string; start?: string; end?: string },
) {
  await page.goto("/finances/schedules")
  await page.getByRole("button", { name: "New Schedule" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Wallet", { exact: true }).selectOption({ label: schedule.wallet })
  await dialog.getByLabel("Amount").fill(schedule.amount)
  if (schedule.start) await dialog.getByLabel("Start date").fill(schedule.start)
  if (schedule.end) await dialog.getByLabel("End date (optional)").fill(schedule.end)
  // WebKit does not scroll the dialog's scroller to a field it fills; a person would.
  await dialog.getByLabel("Note").scrollIntoViewIfNeeded()
  await dialog.getByLabel("Note").fill(schedule.note)
  await dialog.getByRole("button", { name: "Add Schedule" }).click()
  await expect(dialog).toBeHidden()
}

test("a forecast Wallet's Balance check and Schedules make its Forecast on home", async ({
  page,
}, testInfo) => {
  // A Wallet, a check and two Schedules through the screens: a long walk on a phone WebKit.
  test.slow()
  const run = runName(testInfo)
  const name = `E2E forecast ${run}`
  const checkDate = addDays(today(), -10)
  const lateFeeDate = addDays(today(), -5)

  // A Wallet in the forecast.
  await page.goto("/finances/wallets")
  await page.getByRole("button", { name: "New Wallet" }).click()
  const newWallet = page.getByRole("dialog")
  await newWallet.getByLabel("Name").fill(name)
  await newWallet.getByRole("checkbox", { name: "In the forecast" }).click()
  await newWallet.getByRole("button", { name: "Add Wallet" }).click()
  await expect(newWallet).toBeHidden()

  // With no Balance check, its home tab is dashed and asks for one.
  await page.goto("/finances")
  const tabs = page.getByRole("navigation", { name: "Forecast Wallets" })
  const enterBalance = tabs.getByRole("button", { name: `Enter balance for ${name}` })
  await enterBalance.click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("Wallet")).toHaveValue(/.+/)
  await dialog.getByLabel("Date").fill(checkDate)
  await dialog.getByLabel("Balance").fill("1,000")
  await dialog.getByRole("button", { name: "Save Balance check" }).click()
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(enterBalance).toBeHidden()

  await tabs.getByRole("link", { name }).click()
  await expect(page).toHaveURL(/wallet=/)
  await expect(page.getByTestId("today-balance")).toHaveText("$1,000.00")

  // A monthly bill from today, a one-time bill since the check that was never Reconciled, and
  // one from before the check, which the check already includes.
  await addSchedule(page, { wallet: name, amount: "250", note: `E2E rent ${run}` })
  await addSchedule(page, {
    wallet: name,
    amount: "40",
    note: `E2E late fee ${run}`,
    start: lateFeeDate,
    end: lateFeeDate,
  })
  await addSchedule(page, {
    wallet: name,
    amount: "99",
    note: `E2E paid fee ${run}`,
    start: addDays(checkDate, -1),
    end: addDays(checkDate, -1),
  })

  await page.goto("/finances")
  await tabs.getByRole("link", { name }).click()
  const days = page.getByRole("list", { name: "Day by day" })
  const todayRow = days.getByRole("listitem").first()
  await expect(todayRow).toContainText("Today")
  // Both count today: today's balance before them, then the end-of-day balance after them.
  await expect(page.getByTestId("today-balance")).toHaveText("$1,000.00")
  await expect(todayRow).toContainText("$710.00")
  await expect(todayRow).toContainText(`E2E rent ${run}`)
  await expect(todayRow).toContainText("-$250.00")
  await expect(todayRow).toContainText(
    `E2E late fee ${run} · Overdue since ${formatDisplayDate(lateFeeDate)}`,
  )
  await expect(todayRow).toContainText("-$40.00")
  await expect(days).not.toContainText(`E2E paid fee ${run}`)
  await expect(
    page.getByRole("img", { name: /End-of-day balance over the next 90 days/ }),
  ).toBeVisible()

  // The horizon is kept in the address; a longer one lists more of the monthly bill.
  await page.getByRole("link", { name: "30 days" }).click()
  await expect(page).toHaveURL(/days=30/)
  await expect(days.getByText(`E2E rent ${run}`)).toHaveCount(1)
  await page.getByRole("link", { name: "365 days" }).click()
  await expect(days.getByText(`E2E rent ${run}`)).toHaveCount(12)
  // 1,000 − 40 − 12 × 250, on the last bill.
  await expect(page.getByText(/Lowest -\$2,040\.00 on/)).toBeVisible()
  await expect(page.getByText(/Below \$0 on/)).toBeVisible()

  // However many tabs there are, they scroll on their own and the page never scrolls sideways.
  const pageScrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(pageScrollsSideways).toBe(false)
})

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID()
  const response = await page.request.post(`/api/finances/${path}`, { data: { id, ...data } })
  expect(response.status()).toBe(201)
  return id
}

test("an overridden Occurrence and a skipped one show on the Forecast straight away", async ({
  page,
}, testInfo) => {
  const run = runName(testInfo)
  const walletId = await post(page, "wallets", { name: `E2E overrides ${run}`, inForecast: true })
  await post(page, "balance-checks", { walletId, date: today(), amountCents: 100_000 })
  const first = addDays(today(), 3)
  const second = addMonthsClamped(first, 1)
  const third = addMonthsClamped(first, 2)
  const scheduleId = await post(page, "schedules", {
    walletId,
    amountCents: -10_000,
    unit: "month",
    every: 1,
    startDate: first,
    note: `E2E bill ${run}`,
  })

  const days = page.getByRole("list", { name: "Day by day" })
  const day = (date: string) =>
    days.getByRole("listitem").filter({ hasText: formatDisplayDate(date) })
  await page.goto(`/finances?wallet=${walletId}`)
  await expect(day(first)).toContainText("-$100.00")
  await expect(day(second)).toContainText("$800.00")

  // Override the first's amount and skip the second, on the Schedule page.
  await page.goto(`/finances/schedules/${scheduleId}`)
  const occurrence = (date: string) =>
    page.getByRole("listitem", { name: formatDisplayDate(date), exact: true })
  await occurrence(first).getByRole("button").first().click()
  await occurrence(first).getByLabel("Amount").fill("125")
  await occurrence(first).getByRole("button", { name: "Save" }).click()
  await expect(occurrence(first)).toContainText("Overridden")
  // The badge shows at once; the editor closes once the server has the change.
  await expect(occurrence(first).getByRole("button", { name: "Save" })).toBeHidden()
  await occurrence(second).getByRole("button").first().click()
  await occurrence(second).getByRole("button", { name: "Skip" }).click()
  await expect(occurrence(second)).toContainText("Skipped")
  await expect(occurrence(second).getByRole("button", { name: "Save" })).toBeHidden()

  // Back on home, the Forecast has both.
  await page.goto(`/finances?wallet=${walletId}`)
  await expect(day(first)).toContainText("-$125.00")
  await expect(day(first)).toContainText("$875.00")
  await expect(day(second)).toHaveCount(0)
  await expect(day(third)).toContainText("$775.00")
})

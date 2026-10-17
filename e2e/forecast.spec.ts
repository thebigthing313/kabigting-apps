import type { Page } from "@playwright/test"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

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
  const run = `${testInfo.project.name} ${Date.now()}`
  const name = `E2E forecast ${run}`

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
  await dialog.getByLabel("Balance").fill("1,000")
  await dialog.getByRole("button", { name: "Save Balance check" }).click()
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(enterBalance).toBeHidden()

  await tabs.getByRole("link", { name }).click()
  await expect(page).toHaveURL(/wallet=/)
  await expect(page.getByTestId("today-balance")).toHaveText("$1,000.00")

  // A monthly bill from today, and a one-time bill long past that was never Reconciled.
  await addSchedule(page, { wallet: name, amount: "250", note: `E2E rent ${run}` })
  await addSchedule(page, {
    wallet: name,
    amount: "40",
    note: `E2E late fee ${run}`,
    start: "2020-01-15",
    end: "2020-01-15",
  })

  await page.goto("/finances")
  await tabs.getByRole("link", { name }).click()
  const days = page.getByRole("list", { name: "Day by day" })
  const today = days.getByRole("listitem").first()
  await expect(today).toContainText("Today")
  // Both count today: today's balance before them, then the end-of-day balance after them.
  await expect(page.getByTestId("today-balance")).toHaveText("$1,000.00")
  await expect(today).toContainText("$710.00")
  await expect(today).toContainText(`E2E rent ${run}`)
  await expect(today).toContainText("-$250.00")
  await expect(today).toContainText(`E2E late fee ${run} · Overdue since Jan 15, 2020`)
  await expect(today).toContainText("-$40.00")
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

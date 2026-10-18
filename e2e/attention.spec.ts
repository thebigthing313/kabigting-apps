import { readFileSync } from "node:fs"
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

/**
 * Uploads the made-up bank sample (three lines) under an account number of its own, straight to
 * the server: without the upload dialog to sort them, every line waits in To review.
 */
async function uploadSample(page: Page, walletId: string, accountId: string) {
  const text = readFileSync("src/server/apps/finances/ofx-samples/bank-sgml.ofx", "utf8")
  const response = await page.request.post("/api/finances/uploads", {
    multipart: {
      walletId,
      file: {
        name: "checking.ofx",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(text.replace("<ACCTID>000012345678", `<ACCTID>${accountId}`)),
      },
    },
  })
  expect(response.ok()).toBe(true)
}

/** Opens the bell and returns the popup and one Wallet's group in it. */
async function openBell(page: Page, walletName: string) {
  await page.getByRole("button", { name: /^Notifications/ }).click()
  const popup = page.getByRole("dialog", { name: "Notifications" })
  await expect(popup).toBeVisible()
  return { popup, group: popup.getByRole("region", { name: walletName }) }
}

test("the banner and the bell list what needs attention, each opening where it is fixed", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = `${testInfo.project.name} ${Date.now()}`
  const accountNumber = `${Date.now()}${testInfo.workerIndex}${Math.floor(Math.random() * 1000)}`
  const name = `E2E attention ${run}`
  const walletId = await post(page, "wallets", { name, inForecast: true })
  await post(page, "balance-checks", {
    walletId,
    date: addDays(today(), -10),
    amountCents: 10_000,
  })
  // Overdue since five days ago, and a one-off Overdue since three; then a bill that takes the
  // Wallet under $0.
  const rentStart = addDays(today(), -5)
  const scheduleId = await post(page, "schedules", {
    walletId,
    amountCents: -5_000,
    unit: "month",
    every: 1,
    startDate: rentStart,
    note: `E2E rent ${run}`,
  })
  await post(page, "transactions", {
    status: "planned",
    walletId,
    date: addDays(today(), -3),
    amountCents: -2_000,
    note: `E2E late one-off ${run}`,
  })
  const lowDate = addDays(today(), 10)
  await post(page, "transactions", {
    status: "planned",
    walletId,
    date: lowDate,
    amountCents: -10_000,
    note: `E2E big bill ${run}`,
  })
  await uploadSample(page, walletId, accountNumber)
  // A forecast Wallet with no Balance check.
  const unchecked = `E2E unchecked ${run}`
  await post(page, "wallets", { name: unchecked, inForecast: true })

  // The Wallet's banner shows only its To review and Overdue items.
  await page.goto(`/finances?wallet=${walletId}`)
  const banner = page.getByRole("region", { name: "Needs attention" })
  await expect(banner).toContainText("3 To review · 2 Overdue")
  await expect(banner.getByRole("link")).toHaveCount(3)
  await expect(banner.getByRole("link", { name: /Review 3 uploaded lines/ })).toBeVisible()
  await expect(banner.getByRole("link", { name: new RegExp(`E2E rent ${run}`) })).toBeVisible()
  await expect(banner).not.toContainText(unchecked)

  // The bell's count is the number of items it lists.
  let { popup, group } = await openBell(page, name)
  await expect(group.getByRole("listitem")).toHaveCount(6)
  await expect(group).toContainText(`Below $0 on ${formatDisplayDate(lowDate)}`)
  await expect(popup.getByRole("region", { name: unchecked })).toContainText("No Balance check")
  await expect(async () => {
    const label = await page
      .getByRole("button", { name: /^Notifications/ })
      .getAttribute("aria-label")
    const listed = await popup.getByRole("listitem").count()
    expect(label).toBe(`Notifications, ${listed} items`)
  }).toPass()

  // An Overdue Occurrence opens its Schedule page with its editor open.
  await group.getByRole("link", { name: new RegExp(`E2E rent ${run}`) }).click()
  await expect(page).toHaveURL(new RegExp(`/finances/schedules/${scheduleId}\\?occurrence=`))
  const occurrence = page.getByRole("listitem", { name: formatDisplayDate(rentStart) })
  await expect(occurrence.getByRole("button", { expanded: true })).toBeVisible()
  await expect(occurrence.getByRole("button", { name: "Save" })).toBeVisible()

  // An Overdue one-off opens the Wallet's Activity at Upcoming one-offs.
  ;({ group } = await openBell(page, name))
  await group.getByRole("link", { name: new RegExp(`E2E late one-off ${run}`) }).click()
  await expect(page).toHaveURL(
    new RegExp(`/finances/wallets/${walletId}\\?tab=activity#upcoming-one-offs`),
  )
  await expect(page.getByRole("heading", { name: "Upcoming one-offs" })).toBeInViewport()

  // A line To review opens the Wallet's Activity, where it waits.
  ;({ group } = await openBell(page, name))
  await group.getByRole("link", { name: /FAKE CAFE/ }).click()
  await expect(page.getByRole("list", { name: "To review" }).getByRole("listitem")).toHaveCount(3)

  // A low balance opens the Wallet's home tab at that day.
  ;({ group } = await openBell(page, name))
  await group.getByRole("link", { name: /Below \$0/ }).click()
  await expect(page).toHaveURL(new RegExp(`wallet=${walletId}.*#day-${lowDate}`))
  await expect(page.locator(`#day-${lowDate}`)).toBeInViewport()

  // No Balance check opens the Balance check dialog for that Wallet.
  ;({ popup } = await openBell(page, name))
  await popup
    .getByRole("region", { name: unchecked })
    .getByRole("button", { name: /No Balance check/ })
    .click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("Wallet")).toHaveValue(/.+/)
  await expect(dialog.getByLabel("Wallet").locator("option:checked")).toHaveText(unchecked)
})

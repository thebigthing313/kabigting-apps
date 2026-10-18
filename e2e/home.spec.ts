import type { Page } from "@playwright/test"
import { addDays, today } from "../src/shared/dates.ts"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID()
  const response = await page.request.post(`/api/finances/${path}`, { data: { id, ...data } })
  expect(response.status()).toBe(201)
  return id
}

/** A forecast Wallet with a $1,000 Balance check today and a $100 monthly bill from tomorrow. */
async function forecastWallet(page: Page, name: string) {
  const walletId = await post(page, "wallets", { name, inForecast: true })
  await post(page, "balance-checks", { walletId, date: today(), amountCents: 100_000 })
  await post(page, "schedules", {
    walletId,
    amountCents: -10_000,
    unit: "month",
    every: 1,
    startDate: addDays(today(), 1),
    note: `${name} bill`,
  })
  return walletId
}

test("the All tab shows a card per Wallet, and a forecast Wallet's card opens its tab", async ({
  page,
}, testInfo) => {
  const run = `${testInfo.project.name} ${Date.now()}`
  const inForecast = `E2E card ${run}`
  const outside = `E2E outside ${run}`
  const walletId = await forecastWallet(page, inForecast)
  const outsideId = await post(page, "wallets", { name: outside })
  await post(page, "balance-checks", { walletId: outsideId, date: today(), amountCents: 5_000 })

  await page.goto("/finances?wallet=all")
  const cards = page.getByRole("list", { name: "Wallets" })
  const card = cards.getByRole("link", { name: inForecast })
  await expect(card).toContainText("$1,000.00")
  await expect(card).toContainText("Lowest")
  await expect(card).toContainText(`${inForecast} bill`)
  await expect(card).toContainText("-$100.00")
  const greyed = cards.getByRole("region", { name: outside })
  await expect(greyed).toContainText("Not in the forecast")
  await expect(greyed).toContainText("$50.00")

  // On a phone the cards stack, one above the other, and the page never scrolls sideways.
  if ((page.viewportSize()?.width ?? 0) < 768) {
    const [first, second] = await Promise.all([
      cards.locator(":scope > li").nth(0).boundingBox(),
      cards.locator(":scope > li").nth(1).boundingBox(),
    ])
    expect(second!.y).toBeGreaterThan(first!.y)
    expect(second!.x).toBe(first!.x)
  }
  const scrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(scrollsSideways).toBe(false)

  await card.click()
  await expect(page).toHaveURL(new RegExp(`wallet=${walletId}`))
  await expect(page.getByTestId("today-balance")).toHaveText("$1,000.00")
})

test("Open here by default makes home open on a Wallet, then on All again", async ({
  page,
}, testInfo) => {
  // The default is one household-wide row; browsers setting it at once would race each other.
  test.skip(testInfo.project.name !== "chromium-desktop", "One household default")
  const name = `E2E default ${Date.now()}`
  await forecastWallet(page, name)
  const tabs = page.getByRole("navigation", { name: "Forecast Wallets" })

  // Home opens on All until someone picks a Wallet.
  await page.goto("/finances")
  await expect(tabs.getByRole("link", { name: /^All/ })).toHaveAccessibleName(
    "All (opens here by default)",
  )

  await tabs.getByRole("link", { name }).click()
  await tabs.getByRole("button", { name: `More for ${name}` }).click()
  await page.getByRole("menuitem", { name: "Open here by default" }).click()
  await expect(tabs.getByRole("link", { name })).toHaveAccessibleName(
    `${name} (opens here by default)`,
  )

  await page.goto("/finances")
  await expect(tabs.getByRole("link", { name })).toHaveAttribute("aria-current", "page")
  await expect(page.getByTestId("today-balance")).toHaveText("$1,000.00")

  await tabs.getByRole("link", { name: "All", exact: true }).click()
  await tabs.getByRole("button", { name: "More for All" }).click()
  await page.getByRole("menuitem", { name: "Open here by default" }).click()
  await expect(tabs.getByRole("link", { name: /^All/ })).toHaveAccessibleName(
    "All (opens here by default)",
  )

  await page.goto("/finances")
  await expect(page.getByRole("list", { name: "Wallets" })).toBeVisible()
})

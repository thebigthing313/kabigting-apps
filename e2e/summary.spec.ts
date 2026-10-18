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

test("the Monthly summary steps through months, counting only Actuals", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = `${testInfo.project.name} ${Date.now()}`
  const current = thisMonth()
  const lastMonth = shiftMonth(current, -1)
  const twoMonthsAgo = shiftMonth(current, -2)
  // Older than anything else the e2e runs enter, so it is the first month with Actuals.
  const firstMonth = shiftMonth(current, -40)

  const walletId = await post(page, "wallets", { name: `E2E summary wallet ${run}` })
  const otherWalletId = await post(page, "wallets", { name: `E2E summary other ${run}` })
  const food = `E2E food ${run}`
  const pay = `E2E pay ${run}`
  const old = `E2E old ${run}`
  const foodId = await post(page, "categories", { name: food })
  const payId = await post(page, "categories", { name: pay })
  const oldId = await post(page, "categories", { name: old })
  const actual = (date: string, amountCents: number, categoryId: string) =>
    post(page, "transactions", { status: "actual", walletId, date, amountCents, categoryId })

  await actual(`${firstMonth}-10`, -4_000, oldId)
  await actual(`${twoMonthsAgo}-10`, -10_000, foodId)
  await actual(`${lastMonth}-05`, -30_000, foodId)
  await actual(`${lastMonth}-15`, 100_000, payId)
  await actual(`${current}-01`, -5_000, foodId)
  // Neither a Planned row nor a Transfer counts.
  await post(page, "transactions", {
    status: "planned",
    walletId,
    date: `${lastMonth}-20`,
    amountCents: -99_900,
    categoryId: foodId,
  })
  await post(page, "transfers", {
    status: "actual",
    fromWalletId: walletId,
    toWalletId: otherWalletId,
    date: `${lastMonth}-21`,
    amountCents: 88_800,
  })
  const archived = await page.request.patch(`/api/finances/categories/${oldId}`, {
    data: { archived: true },
  })
  expect(archived.status()).toBe(200)

  // It opens on last month: Pay as income, Food as spending far over its average.
  await page.goto("/finances/summary")
  const month = page.getByRole("heading", { level: 2 })
  await expect(month).toHaveText(formatMonth(lastMonth))
  await expect(page.getByRole("table", { name: "Totals" })).toBeVisible()
  const income = page.getByRole("list", { name: "Income Categories" })
  await expect(income.getByRole("listitem").filter({ hasText: pay })).toContainText("$1,000.00")
  const spending = page.getByRole("list", { name: "Spending Categories" })
  let foodRow = spending.getByRole("listitem").filter({ hasText: food })
  await expect(foodRow).toContainText("-$300.00")
  await expect(foodRow).toContainText("Last month -$100.00")
  // $100 over the 12 months before, since the first Actuals are older still.
  await expect(foodRow).toContainText("avg -$8.33")
  await expect(foodRow).toContainText("Over avg")
  const pageScrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(pageScrollsSideways).toBe(false)

  // Forward to this month, which reads "so far" and is as far as it goes.
  await page.getByRole("button", { name: "Next month" }).click()
  await expect(month).toHaveText(`${formatMonth(current)} so far`)
  foodRow = spending.getByRole("listitem").filter({ hasText: food })
  await expect(foodRow).toContainText("-$50.00")
  await expect(foodRow).toContainText("Last month -$300.00")
  await expect(page.getByRole("button", { name: "Next month" })).toBeDisabled()

  // Back two months.
  await page.getByRole("button", { name: "Previous month" }).click()
  await expect(month).toHaveText(formatMonth(lastMonth))
  await page.getByRole("button", { name: "Previous month" }).click()
  await expect(month).toHaveText(formatMonth(twoMonthsAgo))
  await expect(page).toHaveURL(new RegExp(`month=${twoMonthsAgo}`))
  await expect(spending.getByRole("listitem").filter({ hasText: food })).toContainText("-$100.00")

  // An older month than any Actual shows the first month, marked archived, and stops there.
  await page.goto(`/finances/summary?month=${shiftMonth(firstMonth, -6)}`)
  await expect(month).toHaveText(formatMonth(firstMonth))
  const oldRow = spending.getByRole("listitem").filter({ hasText: old })
  await expect(oldRow).toContainText("archived")
  await expect(oldRow).toContainText("-$40.00")
  await expect(page.getByRole("button", { name: "Previous month" })).toBeDisabled()

  await page.getByRole("link", { name: "Manage Categories" }).click()
  await expect(page).toHaveURL(/\/finances\/categories$/)
})

import type { Locator } from "@playwright/test"
import { format, parse } from "../src/shared/money.ts"
import { accounts, expect, runName, signIn, test } from "./fixtures.ts"

/** The viewer's Balance in cents, as the Balance card on Split's Home shows it. */
async function yourBalance(card: Locator): Promise<number> {
  await expect(card).toContainText(/Your Balance[+-]?\$/)
  const text = (await card.textContent()) ?? ""
  const shown = /Your Balance([+-]?\$[\d,]+\.\d{2})/.exec(text)?.[1]
  const cents = shown === undefined ? null : parse(shown)
  if (cents === null) throw new Error(`No Balance on the card: ${text}`)
  return cents
}

/** "You're owed $50.00", "You owe $5.00" or "You're settled up", as the Balances tab says it. */
function yourRow(cents: number): string {
  if (cents === 0) return "You're settled up"
  return cents > 0 ? `You're owed ${format(cents)}` : `You owe ${format(-cents)}`
}

test("a Member adds an Expense, sees the Balances move, then records a suggested Payment", async ({
  page,
}, testInfo) => {
  test.slow()
  // Each project has its own two Members, so other projects' entries never move this Balance.
  const splitter = accounts().split[testInfo.project.name]
  if (!splitter) throw new Error(`No Split Members seeded for ${testInfo.project.name}`)
  const description = `E2E dinner ${runName(testInfo)}`
  await signIn(page, splitter.email, splitter.password)
  await expect(page.getByRole("heading", { name: `Hello, ${splitter.name}` })).toBeVisible()

  // A retry finds the last attempt's entries, so everything is measured from where it starts.
  await page.goto("/split")
  const card = page.getByRole("region", { name: "Your Balance" })
  const before = await yourBalance(card)

  // You paid $50.00 that only your partner owes: you are owed $50.00 more.
  await page.getByRole("button", { name: "Add Expense" }).click()
  await expect(page.getByRole("heading", { name: "New Expense" })).toBeVisible()
  await page.getByRole("textbox", { name: "Total" }).fill("50")
  await page.getByRole("textbox", { name: "Description" }).fill(description)
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByRole("radio", { name: "You paid it all" }).click()
  await page.getByRole("button", { name: "Next" }).click()
  await page.getByRole("radio", { name: `Only ${splitter.partnerName}` }).click()
  await page.getByRole("button", { name: "Next" }).click()
  await expect(page.getByText(`${splitter.partnerName} owes $50.00`)).toBeVisible()
  await page.getByRole("button", { name: "Add Expense" }).click()

  const owed = before + 5_000
  await expect(page.getByText(description)).toBeVisible()
  await expect(card).toContainText(`Your Balance${format(owed, { sign: "always" })}`)

  await page.getByRole("tab", { name: "Balances" }).click()
  await expect(page).toHaveURL(/tab=balances/)
  const rows = page.getByRole("list", { name: "Balances" }).getByRole("listitem")
  await expect(rows.first()).toHaveText(`You${yourRow(owed)}`)

  // You are owed, so at least one suggestion pays you; recording it takes it off your Balance.
  const suggestion = page
    .getByRole("region", { name: "One way to settle everyone up" })
    .getByRole("button")
    .filter({ hasText: / pays you \$/ })
    .first()
  await expect(suggestion).toBeVisible()
  const words = ((await suggestion.textContent()) ?? "").trim()
  const amount = parse(/\$[\d,]+\.\d{2}$/.exec(words)?.[0] ?? "")
  if (amount === null || amount <= 0) throw new Error(`No amount in "${words}"`)
  await suggestion.click()

  await expect(page.getByRole("heading", { name: "Settle up" })).toBeVisible()
  await expect(page.getByRole("status", { name: "Summary" })).toHaveText(words)
  await expect(page.getByRole("textbox", { name: "Amount" })).toHaveValue(format(amount))
  await page.getByRole("button", { name: "Record Payment" }).click()

  await expect(page).toHaveURL(/\/split$/)
  await expect(card).toContainText(`Your Balance${format(owed - amount, { sign: "always" })}`)
  await expect(page.getByText(words.replace(/ pays you .*/, " → You")).first()).toBeVisible()
})

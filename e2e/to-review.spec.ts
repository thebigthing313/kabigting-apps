import { readFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID()
  const response = await page.request.post(`/api/finances/${path}`, { data: { id, ...data } })
  expect(response.status()).toBe(201)
  return id
}

/**
 * The made-up bank sample (a grocer on Sep 3, payroll on Sep 15, a cafe on Sep 30), under an
 * account number of its own: a bank account belongs to one Wallet.
 */
function sampleFile(accountId: string) {
  const text = readFileSync("src/server/apps/finances/ofx-samples/bank-sgml.ofx", "utf8")
  return {
    name: "checking.ofx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(text.replace("<ACCTID>000012345678", `<ACCTID>${accountId}`)),
  }
}

async function upload(page: Page, file: ReturnType<typeof sampleFile>) {
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: "Upload file" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Statement file").setInputFiles(file)
  await dialog.getByRole("button", { name: "Upload", exact: true }).click()
  return dialog
}

test("uploaded lines with a suggestion wait in To review, and Confirm Reconciles them", async ({
  page,
}, testInfo) => {
  test.slow()
  const run = `${testInfo.project.name} ${Date.now()}`
  const accountNumber = `${Date.now()}${testInfo.workerIndex}${Math.floor(Math.random() * 1000)}`
  const walletId = await post(page, "wallets", { name: `E2E review ${run}` })
  // The grocer's line is near this Schedule's first Occurrence.
  await post(page, "schedules", {
    walletId,
    amountCents: -4_000,
    unit: "month",
    every: 1,
    startDate: "2026-09-01",
    note: `E2E groceries ${run}`,
  })
  // The cafe's line is near a one-off; another one-off is months off.
  const oneOffs = [
    { date: "2026-09-29", amountCents: -800, note: `E2E coffee ${run}` },
    { date: "2026-12-01", amountCents: -2_500, note: `E2E later ${run}` },
  ]
  for (const oneOff of oneOffs) {
    await post(page, "transactions", { status: "planned", walletId, ...oneOff })
  }
  // The payroll was entered by hand the day before it posted.
  const employer = `E2E employer ${run}`
  const accountId = await post(page, "accounts", { name: employer })
  await post(page, "transactions", {
    status: "actual",
    walletId,
    date: "2026-09-14",
    amountCents: 125_000,
    accountId,
    note: "Hand-entered pay",
  })

  await page.goto(`/finances/wallets/${walletId}`)
  const actuals = page.getByRole("list", { name: "Actuals" })
  await expect(actuals.getByRole("button")).toHaveCount(1)

  let dialog = await upload(page, sampleFile(accountNumber))
  await dialog.getByRole("button", { name: "Upload to this Wallet" }).click()
  await expect(dialog.getByRole("status")).toHaveText("3 added, 0 already here")
  await expect(dialog).toContainText("3 lines have suggestions")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(dialog).toBeHidden()

  const toReview = page.getByRole("list", { name: "To review" })
  await expect(toReview.getByRole("listitem")).toHaveCount(3)

  // Pick another lists every outstanding Planned item; Unplanned clears the line instead.
  const cafe = toReview.getByRole("listitem").filter({ hasText: "FAKE CAFE & BAKERY" })
  await expect(cafe).toContainText(`E2E coffee ${run}`)
  await cafe.getByRole("button", { name: "Pick another" }).click()
  const choices = cafe.getByRole("list", { name: "Outstanding Planned" })
  await expect(choices).toContainText(`E2E coffee ${run}`)
  await expect(choices).toContainText(`E2E later ${run}`)
  await cafe.getByRole("button", { name: "Unplanned" }).click()
  await expect(cafe).toHaveCount(0)
  await expect(actuals.getByRole("button").filter({ hasText: "FAKE CAFE" })).not.toContainText(
    "Reconciled to",
  )

  const grocer = toReview.getByRole("listitem").filter({ hasText: "MADE-UP GROCER #12" })
  await expect(grocer).toContainText(`E2E groceries ${run}`)
  await grocer.getByRole("button", { name: "Confirm" }).click()
  await expect(grocer).toHaveCount(0)
  await expect(actuals.getByRole("button").filter({ hasText: "MADE-UP GROCER #12" })).toContainText(
    `Reconciled to E2E groceries ${run}`,
  )

  // Confirming a hand-entry twin keeps the uploaded line, labelled as the hand entry was.
  const payroll = toReview.getByRole("listitem").filter({ hasText: "EXAMPLE EMPLOYER PAYROLL" })
  await expect(payroll).toContainText("Same as your hand entry?")
  await payroll.getByRole("button", { name: "Confirm" }).click()
  await expect(toReview).toHaveCount(0)
  await expect(actuals.getByRole("button")).toHaveCount(3)
  await expect(actuals.getByRole("button").filter({ hasText: employer })).toContainText(
    "+$1,250.00",
  )

  // The same file again adds nothing.
  dialog = await upload(page, sampleFile(accountNumber))
  await expect(dialog.getByRole("status")).toHaveText("0 added, 3 already here")
  await dialog.getByRole("button", { name: "Done" }).click()
  await page.reload()
  await expect(actuals.getByRole("button")).toHaveCount(3)
  await expect(toReview).toHaveCount(0)
})

import { readFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

/**
 * The made-up bank sample, under an account number of its own: a bank account belongs to one
 * Wallet, and each run and project makes its own.
 */
function sampleFile(accountId: string) {
  const text = readFileSync("src/server/apps/finances/ofx-samples/bank-sgml.ofx", "utf8")
  return {
    name: "checking.qfx",
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

test("an uploaded file's lines become Actuals once, and a deleted one can be restored", async ({
  page,
}, testInfo) => {
  test.slow()
  const accountId = `${Date.now()}${testInfo.workerIndex}${Math.floor(Math.random() * 1000)}`
  const last4 = accountId.slice(-4)
  const file = sampleFile(accountId)
  const walletId = crypto.randomUUID()
  const response = await page.request.post("/api/finances/wallets", {
    data: { id: walletId, name: `E2E upload ${testInfo.project.name} ${accountId}` },
  })
  expect(response.status()).toBe(201)
  await page.goto(`/finances/wallets/${walletId}`)
  await expect(page.getByText("No Actuals yet.")).toBeVisible()

  // The first upload of the account asks for its Wallet, starting on this one.
  let dialog = await upload(page, file)
  await expect(dialog.getByRole("heading", { name: "Which Wallet is this?" })).toBeVisible()
  await expect(dialog).toContainText(`the account ending ${last4}`)
  await expect(dialog.getByLabel("Wallet")).toHaveValue(walletId)
  await dialog.getByRole("button", { name: "Upload to this Wallet" }).click()
  await expect(dialog.getByRole("status")).toHaveText("3 added, 0 already here")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(dialog).toBeHidden()

  const actuals = page.getByRole("list", { name: "Actuals" })
  await expect(actuals.getByRole("button")).toHaveCount(3)
  const grocer = actuals.getByRole("button").filter({ hasText: "MADE-UP GROCER #12" })
  await expect(grocer).toContainText("-$42.17")

  // The Wallet remembers the account, so the same file again goes straight there, adding nothing.
  dialog = await upload(page, file)
  await expect(dialog.getByRole("status")).toHaveText("0 added, 3 already here")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(actuals.getByRole("button")).toHaveCount(3)

  // An imported Actual keeps the bank's amount; deleting it ignores it.
  await grocer.click()
  const editor = page.getByRole("dialog")
  await expect(editor.getByLabel("Amount")).toBeDisabled()
  await editor.getByRole("button", { name: "Delete Actual" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click()
  await expect(grocer).toHaveCount(0)

  dialog = await upload(page, file)
  await expect(dialog.getByRole("status")).toHaveText("0 added, 3 already here")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(actuals.getByRole("button")).toHaveCount(2)

  // Ignored lines lists it, and Restore brings it back.
  await page.getByRole("button", { name: "Ignored lines" }).click()
  const ignored = page.getByRole("dialog").getByRole("list", { name: "Ignored lines" })
  await expect(ignored.getByRole("listitem")).toHaveCount(1)
  await expect(ignored).toContainText("MADE-UP GROCER #12")
  await ignored.getByRole("button", { name: "Restore" }).click()
  await expect(page.getByRole("dialog")).toContainText("No ignored lines.")
  await page.keyboard.press("Escape")
  await expect(actuals.getByRole("button")).toHaveCount(3)
  await page.reload()
  await expect(grocer).toContainText("-$42.17")
})

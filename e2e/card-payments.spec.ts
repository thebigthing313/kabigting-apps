import type { Page } from "@playwright/test"
import { expect, MEMBER_STATE, test } from "./fixtures.ts"

test.use({ storageState: MEMBER_STATE })

async function post(page: Page, path: string, data: Record<string, unknown>) {
  const id = crypto.randomUUID()
  const response = await page.request.post(`/api/finances/${path}`, { data: { id, ...data } })
  expect(response.status()).toBe(201)
  return id
}

/** A made-up statement with one card payment line, under its own account number. */
function statementFile(name: string, account: string, line: { date: string; amount: string }) {
  const text = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>999000999<ACCTID>${account}<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><STMTTRN><TRNTYPE>OTHER<DTPOSTED>${line.date}<TRNAMT>${line.amount}<FITID>${name}-PAY<NAME>MADE-UP CARD PAYMENT</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n`
  return { name: `${name}.ofx`, mimeType: "application/octet-stream", buffer: Buffer.from(text) }
}

async function upload(page: Page, file: ReturnType<typeof statementFile>) {
  await page.getByRole("button", { name: "Add", exact: true }).click()
  await page.getByRole("menuitem", { name: "Upload file" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Statement file").setInputFiles(file)
  await dialog.getByRole("button", { name: "Upload", exact: true }).click()
  return dialog
}

test("a card payment in both files stays one Transfer", async ({ page }, testInfo) => {
  test.slow()
  const run = `${testInfo.project.name} ${Date.now()}`
  const number = `${Date.now()}${testInfo.workerIndex}${Math.floor(Math.random() * 1000)}`
  const checkingName = `E2E checking ${run}`
  const cardName = `E2E card ${run}`
  const checking = await post(page, "wallets", { name: checkingName })
  const card = await post(page, "wallets", { name: cardName, shownAsOwed: true })
  const checkingFile = statementFile("checking", `${number}1`, {
    date: "20260910",
    amount: "-250.00",
  })
  const cardFile = statementFile("card", `${number}2`, { date: "20260912", amount: "250.00" })

  // Checking's line has nothing to suggest, so it is unplanned until marked as a Transfer.
  await page.goto(`/finances/wallets/${checking}`)
  let dialog = await upload(page, checkingFile)
  await dialog.getByRole("button", { name: "Upload to this Wallet" }).click()
  await expect(dialog.getByRole("status")).toHaveText("1 added, 0 already here")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(dialog).toBeHidden()

  const actuals = page.getByRole("list", { name: "Actuals" })
  await actuals.getByRole("button").filter({ hasText: "MADE-UP CARD PAYMENT" }).click()
  dialog = page.getByRole("dialog")
  await dialog.getByRole("button", { name: "Mark as Transfer…" }).click()
  await dialog.getByLabel("Moved to Wallet").selectOption({ label: cardName })
  await dialog.getByRole("button", { name: "Mark as Transfer", exact: true }).click()
  await expect(dialog).toBeHidden()
  const payment = actuals.getByRole("button").filter({ hasText: `Transfer to ${cardName}` })
  await expect(payment).toContainText("Only one side arrived")

  // The card's own line is offered as the other side, and joins the Transfer.
  await page.goto(`/finances/wallets/${card}`)
  dialog = await upload(page, cardFile)
  await dialog.getByRole("button", { name: "Upload to this Wallet" }).click()
  await expect(dialog.getByRole("status")).toHaveText("1 added, 0 already here")
  await expect(dialog).toContainText("1 line has a suggestion")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(dialog).toBeHidden()

  const toReview = page.getByRole("list", { name: "To review" })
  const line = toReview.getByRole("listitem").filter({ hasText: "MADE-UP CARD PAYMENT" })
  await expect(line).toContainText(`Other side of Transfer from ${checkingName}?`)
  await line.getByRole("button", { name: "Confirm" }).click()
  await expect(toReview).toHaveCount(0)
  const cardActuals = page.getByRole("list", { name: "Actuals" })
  await expect(cardActuals.getByRole("button")).toHaveCount(1)
  await expect(cardActuals.getByRole("button")).toContainText(`Transfer from ${checkingName}`)
  await expect(cardActuals.getByRole("button")).not.toContainText("Only one side arrived")

  // Either file again adds nothing.
  dialog = await upload(page, cardFile)
  await expect(dialog.getByRole("status")).toHaveText("0 added, 1 already here")
  await dialog.getByRole("button", { name: "Done" }).click()
  await page.goto(`/finances/wallets/${checking}`)
  dialog = await upload(page, checkingFile)
  await expect(dialog.getByRole("status")).toHaveText("0 added, 1 already here")
  await dialog.getByRole("button", { name: "Done" }).click()
  await expect(actuals.getByRole("button")).toHaveCount(1)
  await expect(payment).not.toContainText("Only one side arrived")
})

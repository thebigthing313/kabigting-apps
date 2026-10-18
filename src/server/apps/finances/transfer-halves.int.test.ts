import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { financesTransactions, financesTransfers } from "#server/db/schema/index.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import {
  accountRow,
  reconcileResult,
  transactionRow,
  transactionRows,
  transferRow,
  transferRows,
  uploadDone,
  walletRow,
} from "#shared/finances/schemas.ts"
import { newId } from "#shared/ids.ts"

let server: TestServer
let headers: Headers
let noAccessHeaders: Headers
let adminHeaders: Headers

function post(path: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/${path}`, json("POST", body, as))
}

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
  noAccessHeaders = (await server.signedInAccount()).headers
  adminHeaders = (await server.signedInAccount({ role: "admin" })).headers
})

afterAll(async () => {
  await server.close()
})

let counter = 0

async function newWallet() {
  counter += 1
  const response = await post("wallets", { id: newId(), name: `Halves wallet ${counter}` })
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json()).id
}

async function newAccount() {
  counter += 1
  const response = await post("accounts", { id: newId(), name: `Halves account ${counter}` })
  expect(response.status).toBe(201)
  return accountRow.parse(await response.json()).id
}

/** An uploaded line, as an upload stores it: a made-up card payment out of checking by default. */
async function uploaded(
  walletId: string,
  body: Partial<typeof financesTransactions.$inferInsert> = {},
) {
  const [row] = await server.db
    .insert(financesTransactions)
    .values({
      status: "actual",
      walletId,
      date: "2026-11-03",
      amountCents: -25_000,
      source: "ofx",
      sourceKey: `FITID-${newId()}`,
      bankDescription: "MADE-UP CARD PAYMENT",
      ...body,
    })
    .returning()
  return row!
}

/** An Actual Transfer whose from side's line arrived; its to side is still to come. */
async function waiting(
  fromWalletId: string,
  toWalletId: string,
  body: Partial<typeof financesTransfers.$inferInsert> = {},
) {
  const [row] = await server.db
    .insert(financesTransfers)
    .values({
      status: "actual",
      date: "2026-11-03",
      amountCents: 25_000,
      fromWalletId,
      toWalletId,
      fromSource: "ofx",
      fromSourceKey: `FITID-${newId()}`,
      fromBankDescription: "MADE-UP CARD PAYMENT",
      ...body,
    })
    .returning()
  return row!
}

async function transactions(body: Record<string, unknown>) {
  const response = await post("transactions/query", body)
  expect(response.status).toBe(200)
  return transactionRows.parse(await response.json()).rows
}

async function transfers(body: Record<string, unknown>) {
  const response = await post("transfers/query", body)
  expect(response.status).toBe(200)
  return transferRows.parse(await response.json()).rows
}

async function expectStatus(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  await expect(response.json()).resolves.toMatchObject({ error: { code } })
}

function markTransfer(id: string, otherWalletId: string, as?: Headers) {
  return post(`transactions/${id}/mark-transfer`, { otherWalletId }, as)
}

function pair(transferId: string, actualId: string, as?: Headers) {
  return post(`transfers/${transferId}/pair`, { actualId }, as)
}

describe("mark as Transfer", () => {
  test("an uploaded line out of a Wallet becomes an Actual Transfer keyed on its side", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const accountId = await newAccount()
    const line = await uploaded(checking, { accountId, note: "statement paid" })

    const response = await markTransfer(line.id, card)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.deletedTransactions).toEqual([line.id])
    expect(result.transfers).toHaveLength(1)
    expect(result.transfers[0]).toMatchObject({
      status: "actual",
      date: "2026-11-03",
      amountCents: 25_000,
      fromWalletId: checking,
      toWalletId: card,
      accountId,
      note: "statement paid",
      fromSource: "ofx",
      fromBankDescription: "MADE-UP CARD PAYMENT",
      toSource: null,
      toBankDescription: null,
    })
    expect(await transactions({ ids: [line.id] })).toEqual([])
    expect(await transfers({ walletId: card })).toEqual(result.transfers)
  })

  test("money into a Wallet becomes a Transfer from the other Wallet, keyed on the to side", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const line = await uploaded(card, { amountCents: 25_000 })
    const response = await markTransfer(line.id, checking)
    expect(response.status).toBe(200)
    const [made] = reconcileResult.parse(await response.json()).transfers
    expect(made).toMatchObject({
      fromWalletId: checking,
      toWalletId: card,
      amountCents: 25_000,
      fromSource: null,
      toSource: "ofx",
    })
  })

  test("a hand-entered Actual becomes an Actual Transfer with no key on either side", async () => {
    const checking = await newWallet()
    const savings = await newWallet()
    const created = await post("transactions", {
      id: newId(),
      status: "actual",
      walletId: checking,
      date: "2026-11-04",
      amountCents: -10_000,
    })
    const hand = transactionRow.parse(await created.json())
    const response = await markTransfer(hand.id, savings)
    expect(response.status).toBe(200)
    const [made] = reconcileResult.parse(await response.json()).transfers
    expect(made).toMatchObject({ fromSource: "manual", toSource: null, amountCents: 10_000 })
  })

  test("refuses a Planned row, an ignored line, its own Wallet or an unknown one", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const created = await post("transactions", {
      id: newId(),
      status: "planned",
      walletId: checking,
      date: "2026-11-04",
      amountCents: -10_000,
    })
    const planned = transactionRow.parse(await created.json())
    await expectStatus(await markTransfer(planned.id, card), 400, "validation_failed")
    const ignored = await uploaded(checking, { ignored: true })
    await expectStatus(await markTransfer(ignored.id, card), 400, "validation_failed")
    const line = await uploaded(checking)
    await expectStatus(await markTransfer(line.id, checking), 400, "validation_failed")
    await expectStatus(await markTransfer(line.id, newId()), 400, "validation_failed")
    await expectStatus(await markTransfer(newId(), card), 404, "not_found")
    expect(await transactions({ ids: [line.id] })).toHaveLength(1)
  })

  test("refuses a Reconciled Actual until it is un-Reconciled", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const created = await post("transactions", {
      id: newId(),
      status: "planned",
      walletId: checking,
      date: "2026-11-03",
      amountCents: -25_000,
    })
    const planned = transactionRow.parse(await created.json())
    const line = await uploaded(checking)
    const reconciled = await post("reconcile", {
      plannedKind: "transaction",
      plannedRef: planned.id,
      actualId: line.id,
    })
    expect(reconciled.status).toBe(200)
    await expectStatus(await markTransfer(line.id, card), 409, "conflict")
  })

  test("needs Finances access; the Admin has it", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const line = await uploaded(checking)
    await expectStatus(await markTransfer(line.id, card, noAccessHeaders), 403, "forbidden_app")
    expect((await markTransfer(line.id, card, adminHeaders)).status).toBe(200)
  })
})

describe("pair a Transfer's other side", () => {
  test("moves the line's key onto the missing side and removes the line", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const transfer = await waiting(checking, card)
    const line = await uploaded(card, {
      amountCents: 25_000,
      date: "2026-11-05",
      bankDescription: "MADE-UP PAYMENT THANK YOU",
    })

    const response = await pair(transfer.id, line.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.deletedTransactions).toEqual([line.id])
    expect(result.transfers).toHaveLength(1)
    expect(result.transfers[0]).toMatchObject({
      id: transfer.id,
      // The first line's date and amount stay.
      date: "2026-11-03",
      amountCents: 25_000,
      fromSource: "ofx",
      toSource: "ofx",
      toBankDescription: "MADE-UP PAYMENT THANK YOU",
    })
    expect(await transactions({ ids: [line.id] })).toEqual([])
  })

  test("takes the line's Account and note when the Transfer has none", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const accountId = await newAccount()
    const transfer = await waiting(checking, card)
    const line = await uploaded(card, { amountCents: 25_000, accountId, note: "autopay" })
    const response = await pair(transfer.id, line.id)
    const [paired] = reconcileResult.parse(await response.json()).transfers
    expect(paired).toMatchObject({ accountId, note: "autopay" })
  })

  test("refuses a line that isn't its other side: another Wallet, amount, way or week", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const savings = await newWallet()
    const transfer = await waiting(checking, card)
    const refused = [
      await uploaded(savings, { amountCents: 25_000 }),
      await uploaded(card, { amountCents: 25_001 }),
      await uploaded(card, { amountCents: -25_000 }),
      await uploaded(card, { amountCents: 25_000, date: "2026-11-11" }),
      // The side that already arrived.
      await uploaded(checking),
    ]
    for (const line of refused) {
      await expectStatus(await pair(transfer.id, line.id), 400, "validation_failed")
    }
  })

  test("refuses a hand entry, an ignored line or a Planned row", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const transfer = await waiting(checking, card)
    const hand = await uploaded(card, { amountCents: 25_000, source: "manual", sourceKey: null })
    const ignored = await uploaded(card, { amountCents: 25_000, ignored: true })
    const planned = await uploaded(card, {
      amountCents: 25_000,
      status: "planned",
      source: null,
      sourceKey: null,
    })
    for (const line of [hand, ignored, planned]) {
      await expectStatus(await pair(transfer.id, line.id), 400, "validation_failed")
    }
  })

  test("refuses a Transfer not waiting for a side: both arrived, or ignored", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const both = await waiting(checking, card, { toSource: "ofx", toSourceKey: `FITID-${newId()}` })
    const ignored = await waiting(checking, card, { ignored: true })
    const line = await uploaded(card, { amountCents: 25_000 })
    for (const transfer of [both, ignored]) {
      await expectStatus(await pair(transfer.id, line.id), 400, "validation_failed")
    }
    await expectStatus(await pair(newId(), line.id), 404, "not_found")
    await expectStatus(await pair(both.id, newId()), 404, "not_found")
  })

  test("refuses a Reconciled line until it is un-Reconciled", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const transfer = await waiting(checking, card)
    const created = await post("transactions", {
      id: newId(),
      status: "planned",
      walletId: card,
      date: "2026-11-03",
      amountCents: 25_000,
    })
    const planned = transactionRow.parse(await created.json())
    const line = await uploaded(card, { amountCents: 25_000 })
    const reconciled = await post("reconcile", {
      plannedKind: "transaction",
      plannedRef: planned.id,
      actualId: line.id,
    })
    expect(reconciled.status).toBe(200)
    await expectStatus(await pair(transfer.id, line.id), 409, "conflict")
  })

  test("needs Finances access; the Admin has it", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const transfer = await waiting(checking, card)
    const line = await uploaded(card, { amountCents: 25_000 })
    await expectStatus(await pair(transfer.id, line.id, noAccessHeaders), 403, "forbidden_app")
    expect((await pair(transfer.id, line.id, adminHeaders)).status).toBe(200)
  })
})

/** A made-up card payment entered by hand from checking to the card: neither side keyed. */
async function enteredByHand(fromWalletId: string, toWalletId: string, date = "2026-11-03") {
  const response = await post("transfers", {
    id: newId(),
    status: "actual",
    date,
    amountCents: 25_000,
    fromWalletId,
    toWalletId,
  })
  expect(response.status).toBe(201)
  return transferRow.parse(await response.json())
}

describe("pair a line with a hand-entered Transfer", () => {
  test("the card's line becomes the to side; the Transfer keeps its date and amount", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const transfer = await enteredByHand(checking, card)
    expect(transfer).toMatchObject({ fromSource: "manual", toSource: "manual" })
    const line = await uploaded(card, {
      amountCents: 25_000,
      date: "2026-11-05",
      bankDescription: "MADE-UP PAYMENT THANK YOU",
    })

    const response = await pair(transfer.id, line.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.deletedTransactions).toEqual([line.id])
    expect(result.transfers).toEqual([
      expect.objectContaining({
        id: transfer.id,
        date: "2026-11-03",
        amountCents: 25_000,
        fromSource: "manual",
        fromBankDescription: null,
        toSource: "ofx",
        toBankDescription: "MADE-UP PAYMENT THANK YOU",
      }),
    ])
    expect(await transactions({ ids: [line.id] })).toEqual([])
    const [stored] = await server.db
      .select()
      .from(financesTransfers)
      .where(eq(financesTransfers.id, transfer.id))
    expect(stored).toMatchObject({ toSourceKey: line.sourceKey, fromSourceKey: null })
  })

  test("the checking line becomes the from side", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const transfer = await enteredByHand(checking, card)
    const line = await uploaded(checking, { date: "2026-11-01" })
    const response = await pair(transfer.id, line.id)
    expect(response.status).toBe(200)
    const [paired] = reconcileResult.parse(await response.json()).transfers
    expect(paired).toMatchObject({ fromSource: "ofx", toSource: "manual" })
  })

  test("a hand-entered Actual marked as a Transfer takes either Wallet's line", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    for (const [lineWallet, amountCents] of [
      [checking, -25_000],
      [card, 25_000],
    ] as const) {
      const created = await post("transactions", {
        id: newId(),
        status: "actual",
        walletId: checking,
        date: "2026-11-03",
        amountCents: -25_000,
      })
      const hand = transactionRow.parse(await created.json())
      const marked = await markTransfer(hand.id, card)
      const [transfer] = reconcileResult.parse(await marked.json()).transfers
      const line = await uploaded(lineWallet, { amountCents })
      const response = await pair(transfer!.id, line.id)
      expect(response.status).toBe(200)
      const [paired] = reconcileResult.parse(await response.json()).transfers
      expect(lineWallet === checking ? paired?.fromSource : paired?.toSource).toBe("ofx")
    }
  })

  test("refuses another amount, the wrong way, another Wallet or more than 3 days off", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const savings = await newWallet()
    const transfer = await enteredByHand(checking, card)
    const refused = [
      await uploaded(card, { amountCents: 25_001 }),
      await uploaded(card, { amountCents: -25_000 }),
      await uploaded(checking, { amountCents: 25_000 }),
      await uploaded(savings, { amountCents: 25_000 }),
      await uploaded(card, { amountCents: 25_000, date: "2026-11-07" }),
      await uploaded(checking, { date: "2026-10-30" }),
    ]
    for (const line of refused) {
      await expectStatus(await pair(transfer.id, line.id), 400, "validation_failed")
    }
    const [stored] = await transfers({ ids: [transfer.id] })
    expect(stored).toMatchObject({ fromSource: "manual", toSource: "manual" })
  })

  test("refuses a line that would write over a side's key", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const transfer = await enteredByHand(checking, card)
    const first = await uploaded(card, { amountCents: 25_000 })
    expect((await pair(transfer.id, first.id)).status).toBe(200)
    const second = await uploaded(card, { amountCents: 25_000, date: "2026-11-04" })
    await expectStatus(await pair(transfer.id, second.id), 400, "validation_failed")
    const [stored] = await server.db
      .select()
      .from(financesTransfers)
      .where(eq(financesTransfers.id, transfer.id))
    expect(stored?.toSourceKey).toBe(first.sourceKey)
    expect(await transactions({ ids: [second.id] })).toHaveLength(1)
  })
})

// De-duplication through the upload route: a line stays here whether it is a Transaction, one
// side of a Transfer, or ignored.

/** A made-up statement for its own bank account, with one line per entry. */
function statement(account: string, lines: { date: string; amount: string; fitid: string }[]) {
  const body = lines
    .map(
      ({ date, amount, fitid }) =>
        `<STMTTRN><TRNTYPE>OTHER<DTPOSTED>${date}<TRNAMT>${amount}<FITID>${fitid}<NAME>MADE-UP LINE</STMTTRN>`,
    )
    .join("\n")
  return `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>999000999<ACCTID>${account}<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>${body}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n`
}

async function upload(text: string, walletId?: string) {
  const form = new FormData()
  form.set("file", new File([text], "statement.ofx"))
  if (walletId !== undefined) form.set("walletId", walletId)
  const response = await server.app.request("/api/finances/uploads", {
    method: "POST",
    headers,
    body: form,
  })
  expect(response.status).toBe(200)
  return uploadDone.parse(await response.json())
}

/** A checking file and a card file that both hold one card payment, plus a purchase each. */
async function twoFiles() {
  counter += 1
  const checking = await newWallet()
  const card = await newWallet()
  const checkingFile = statement(`${Date.now()}1${counter}`, [
    { date: "20261103", amount: "-250.00", fitid: "CHK-PAY" },
    { date: "20261104", amount: "-9.99", fitid: "CHK-BUY" },
  ])
  const cardFile = statement(`${Date.now()}2${counter}`, [
    { date: "20261105", amount: "250.00", fitid: "CARD-PAY" },
    { date: "20261106", amount: "-19.99", fitid: "CARD-BUY" },
  ])
  const fromChecking = await upload(checkingFile, checking)
  const fromCard = await upload(cardFile, card)
  const payment = (rows: typeof fromChecking.inserted) =>
    rows.find((row) => Math.abs(row.amountCents) === 25_000)!
  return {
    checking,
    card,
    checkingFile,
    cardFile,
    checkingPayment: payment(fromChecking.inserted),
    cardPayment: payment(fromCard.inserted),
  }
}

describe("a card payment seen from both Wallets", () => {
  test("marked as a Transfer and paired, re-uploading either file adds nothing", async () => {
    const files = await twoFiles()
    const marked = await markTransfer(files.checkingPayment.id, files.card)
    const [transfer] = reconcileResult.parse(await marked.json()).transfers
    expect((await pair(transfer!.id, files.cardPayment.id)).status).toBe(200)

    for (const file of [files.checkingFile, files.cardFile]) {
      const again = await upload(file)
      expect(again.inserted).toEqual([])
      expect(again.duplicates).toBe(2)
    }
    const [stored] = await transfers({ walletId: files.card })
    expect(stored).toMatchObject({ fromSource: "ofx", toSource: "ofx", ignored: false })
  })

  test("Reconciled to a Planned Transfer and paired, re-uploading adds nothing", async () => {
    const files = await twoFiles()
    const created = await post("transfers", {
      id: newId(),
      status: "planned",
      date: "2026-11-02",
      amountCents: 25_000,
      fromWalletId: files.checking,
      toWalletId: files.card,
    })
    const planned = transferRow.parse(await created.json())
    const reconciled = await post("reconcile", {
      plannedKind: "transfer",
      plannedRef: planned.id,
      actualId: files.checkingPayment.id,
    })
    expect(reconciled.status).toBe(200)
    const made = reconcileResult
      .parse(await reconciled.json())
      .transfers.find((row) => row.status === "actual")!
    expect(made).toMatchObject({ fromSource: "ofx", toSource: null })
    expect((await pair(made.id, files.cardPayment.id)).status).toBe(200)

    for (const file of [files.checkingFile, files.cardFile]) {
      expect((await upload(file)).inserted).toEqual([])
    }
  })

  test("a deleted, paired Transfer stays ignored, and re-uploading adds nothing", async () => {
    const files = await twoFiles()
    const marked = await markTransfer(files.checkingPayment.id, files.card)
    const [transfer] = reconcileResult.parse(await marked.json()).transfers
    expect((await pair(transfer!.id, files.cardPayment.id)).status).toBe(200)
    const deleted = await server.app.request(`/api/finances/transfers/${transfer!.id}`, {
      method: "DELETE",
      headers,
    })
    expect(transferRow.parse(await deleted.json()).ignored).toBe(true)

    for (const file of [files.checkingFile, files.cardFile]) {
      expect((await upload(file)).inserted).toEqual([])
    }
  })

  test("entered by hand and paired from the checking file, re-uploading adds nothing", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const transfer = await enteredByHand(checking, card, "2026-11-02")
    counter += 1
    const checkingFile = statement(`${Date.now()}5${counter}`, [
      { date: "20261103", amount: "-250.00", fitid: "HAND-PAY" },
    ])
    const [line] = (await upload(checkingFile, checking)).inserted
    expect((await pair(transfer.id, line!.id)).status).toBe(200)
    expect(await transfers({ walletId: checking })).toHaveLength(1)
    expect(await transactions({ walletId: checking })).toEqual([])
    const again = await upload(checkingFile)
    expect(again.inserted).toEqual([])
    expect(again.duplicates).toBe(1)
  })

  test("only the side that arrived is here: the other Wallet's file still adds its line", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    counter += 1
    const checkingFile = statement(`${Date.now()}3${counter}`, [
      { date: "20261103", amount: "-250.00", fitid: "ONLY-PAY" },
    ])
    const [line] = (await upload(checkingFile, checking)).inserted
    expect((await markTransfer(line!.id, card)).status).toBe(200)
    expect((await upload(checkingFile)).inserted).toEqual([])

    // The same key in the card's file is the card's own line, not the checking side's.
    const cardFile = statement(`${Date.now()}4${counter}`, [
      { date: "20261105", amount: "250.00", fitid: "ONLY-PAY" },
    ])
    expect((await upload(cardFile, card)).inserted).toHaveLength(1)
  })
})

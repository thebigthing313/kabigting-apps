import { readFileSync } from "node:fs"
import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import { financesWallets } from "#server/db/schema/index.ts"
import {
  transactionRow,
  transactionRows,
  uploadDone,
  uploadNeedsWallet,
  walletRow,
} from "#shared/finances/schemas.ts"
import { newId } from "#shared/ids.ts"

let server: TestServer
let headers: Headers

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
})

afterAll(async () => {
  await server.close()
})

let counter = 0

async function newWallet(more: Record<string, unknown> = {}) {
  counter += 1
  const response = await server.app.request(
    "/api/finances/wallets",
    json("POST", { id: newId(), name: `Upload wallet ${counter}`, ...more }, headers),
  )
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json())
}

/**
 * A made-up statement. Each test gets its own account number, as a Wallet remembers one bank
 * account and a bank account belongs to one Wallet.
 */
function statement(lines: string, account = `${Date.now()}${(counter += 1)}`) {
  return {
    account,
    text: `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>999000999<ACCTID>${account}<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>${lines}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n`,
  }
}

function line(date: string, amount: string, name: string, fitid?: string) {
  const key = fitid === undefined ? "" : `<FITID>${fitid}`
  return `<STMTTRN><TRNTYPE>OTHER<DTPOSTED>${date}<TRNAMT>${amount}${key}<NAME>${name}</STMTTRN>`
}

const THREE_LINES = [
  line("20261001", "-12.34", "MADE-UP DINER", "UP-1"),
  line("20261002", "500.00", "PRETEND REFUND", "UP-2"),
  line("20261003", "-3.00", "FAKE KIOSK"),
].join("\n")

function upload(file: { text: string; name?: string }, walletId?: string, as: Headers = headers) {
  const form = new FormData()
  form.set("file", new File([file.text], file.name ?? "statement.ofx"))
  if (walletId !== undefined) form.set("walletId", walletId)
  return server.app.request("/api/finances/uploads", { method: "POST", headers: as, body: form })
}

async function uploaded(file: { text: string; name?: string }, walletId?: string) {
  const response = await upload(file, walletId)
  expect(response.status).toBe(200)
  return uploadDone.parse(await response.json())
}

async function query(body: unknown) {
  const response = await server.app.request(
    "/api/finances/transactions/query",
    json("POST", body, headers),
  )
  expect(response.status).toBe(200)
  return transactionRows.parse(await response.json()).rows
}

function patch(id: string, body: unknown) {
  return server.app.request(`/api/finances/transactions/${id}`, json("PATCH", body, headers))
}

function remove(id: string) {
  return server.app.request(`/api/finances/transactions/${id}`, { method: "DELETE", headers })
}

function expectStatus(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  return expect(response.json()).resolves.toMatchObject({ error: { code } })
}

describe("access", () => {
  test("without Finances access an upload is 403 forbidden_app, and 401 without a session", async () => {
    const guest = (await server.signedInAccount({ apps: [] })).headers
    await expectStatus(await upload(statement(THREE_LINES), undefined, guest), 403, "forbidden_app")
    expect((await upload(statement(THREE_LINES), undefined, new Headers())).status).toBe(401)
  })

  test("the Admin uploads without an access row", async () => {
    const admin = (await server.signedInAccount({ role: "admin" })).headers
    const response = await upload(statement(THREE_LINES), undefined, admin)
    expect(response.status).toBe(200)
    expect(uploadNeedsWallet.safeParse(await response.json()).success).toBe(true)
  })
})

describe("the first upload of a bank account", () => {
  test("asks for its Wallet by the last four digits, storing nothing until it is picked", async () => {
    const file = statement(THREE_LINES, "000011112222")
    const wallet = await newWallet()
    const response = await upload(file)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ needsWallet: { last4: "2222" } })
    expect(await query({ walletId: wallet.id })).toEqual([])
  })

  test("with a Wallet, adds every posted line as an Actual and the Wallet remembers the account", async () => {
    const file = statement(THREE_LINES)
    const wallet = await newWallet()
    const result = await uploaded(file, wallet.id)
    expect(result.duplicates).toBe(0)
    expect(result.wallet).toMatchObject({ id: wallet.id, bankAccountLast4: file.account.slice(-4) })
    const byDate = result.inserted.toSorted((a, b) => a.date.localeCompare(b.date))
    expect(byDate).toMatchObject([
      { date: "2026-10-01", amountCents: -1234, bankDescription: "MADE-UP DINER" },
      { date: "2026-10-02", amountCents: 50_000, bankDescription: "PRETEND REFUND" },
      { date: "2026-10-03", amountCents: -300, bankDescription: "FAKE KIOSK" },
    ])
    for (const row of result.inserted) {
      expect(row).toMatchObject({
        status: "actual",
        walletId: wallet.id,
        source: "ofx",
        ignored: false,
        reviewedAt: null,
        accountId: null,
        categoryId: null,
        note: "",
      })
    }
    expect(await query({ walletId: wallet.id })).toHaveLength(3)
  })

  test("only a hash and the last four digits of the account are stored", async () => {
    const file = statement(THREE_LINES, "000099998888")
    const wallet = await newWallet()
    await uploaded(file, wallet.id)
    const [stored] = await server.db
      .select()
      .from(financesWallets)
      .where(eq(financesWallets.id, wallet.id))
    expect(stored?.bankAccountLast4).toBe("8888")
    expect(stored?.bankAccountHash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(stored)).not.toContain("000099998888")
  })

  test("refuses a Wallet that is unknown, archived or already remembers another account", async () => {
    await expectStatus(await upload(statement(THREE_LINES), newId()), 400, "validation_failed")
    const archived = await newWallet()
    await server.app.request(
      `/api/finances/wallets/${archived.id}`,
      json("PATCH", { archived: true }, headers),
    )
    await expectStatus(await upload(statement(THREE_LINES), archived.id), 400, "validation_failed")
    const taken = await newWallet()
    await uploaded(statement(THREE_LINES), taken.id)
    const refused = await upload(statement(THREE_LINES), taken.id)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ error: { code: "conflict" } })
  })

  test("after Forget, the next upload asks for the Wallet again", async () => {
    const file = statement(THREE_LINES)
    const wallet = await newWallet()
    await uploaded(file, wallet.id)
    await server.app.request(
      `/api/finances/wallets/${wallet.id}`,
      json("PATCH", { bankAccountLast4: null }, headers),
    )
    expect(await (await upload(file)).json()).toEqual({
      needsWallet: { last4: file.account.slice(-4) },
    })
  })
})

describe("uploading again", () => {
  test("goes to the remembered Wallet and adds nothing already stored", async () => {
    const file = statement(THREE_LINES)
    const wallet = await newWallet()
    await uploaded(file, wallet.id)
    const again = await uploaded(file)
    expect(again).toMatchObject({ inserted: [], duplicates: 3, wallet: { id: wallet.id } })
    expect(await query({ walletId: wallet.id })).toHaveLength(3)
  })

  test("a later file overlapping the first adds only its new lines", async () => {
    const wallet = await newWallet()
    const first = statement(THREE_LINES)
    await uploaded(first, wallet.id)
    const later = statement(
      [THREE_LINES, line("20261004", "-1.00", "MADE-UP PARKING", "UP-4")].join("\n"),
      first.account,
    )
    const result = await uploaded(later)
    expect(result.duplicates).toBe(3)
    expect(result.inserted).toMatchObject([{ date: "2026-10-04", amountCents: -100 }])
  })

  test("a line someone deleted stays ignored, and Restore brings it back", async () => {
    const file = statement(THREE_LINES)
    const wallet = await newWallet()
    const { inserted } = await uploaded(file, wallet.id)
    const deleted = inserted[0]!
    expect((await remove(deleted.id)).status).toBe(200)

    expect(await uploaded(file)).toMatchObject({ inserted: [], duplicates: 3 })
    expect(await query({ walletId: wallet.id })).toHaveLength(2)

    const response = await patch(deleted.id, { ignored: false })
    expect(response.status).toBe(200)
    expect(transactionRow.parse(await response.json())).toMatchObject({
      id: deleted.id,
      ignored: false,
    })
    expect(await query({ walletId: wallet.id })).toHaveLength(3)
    // Ignoring is what Delete does; a patch can only restore.
    expect((await patch(deleted.id, { ignored: true })).status).toBe(400)
  })

  test("the same line in another Wallet's file is that Wallet's own line", async () => {
    const lines = line("20261001", "-12.34", "MADE-UP DINER", "SAME-FITID")
    const one = await newWallet()
    const other = await newWallet()
    expect((await uploaded(statement(lines), one.id)).inserted).toHaveLength(1)
    expect((await uploaded(statement(lines), other.id)).inserted).toHaveLength(1)
  })
})

describe("imported Actuals", () => {
  test("keep their amount, date and Wallet; Category, Account and note can change", async () => {
    const wallet = await newWallet()
    const [row] = (await uploaded(statement(THREE_LINES), wallet.id)).inserted
    for (const body of [
      { amountCents: 1 },
      { date: "2026-01-01" },
      { walletId: (await newWallet()).id },
    ]) {
      await expectStatus(await patch(row!.id, body), 400, "validation_failed")
    }
    expect((await patch(row!.id, { note: "Made-up note" })).status).toBe(200)
  })
})

describe("files it refuses", () => {
  test("a file that isn't a statement is 400 with the reason", async () => {
    const response = await upload({ text: "Date,Amount\n2026-10-01,-5.00\n" })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: "validation_failed", message: expect.stringContaining("isn't an OFX") },
    })
  })

  test("only .ofx, .qfx and .qbo files are read", async () => {
    await expectStatus(
      await upload({ ...statement(THREE_LINES), name: "statement.csv" }),
      400,
      "validation_failed",
    )
    for (const name of ["statement.QFX", "statement.qbo"]) {
      const response = await upload({ ...statement(THREE_LINES), name })
      expect(response.status).toBe(200)
    }
  })

  test("a request without a file is 400", async () => {
    const response = await server.app.request("/api/finances/uploads", {
      method: "POST",
      headers,
      body: new FormData(),
    })
    await expectStatus(response, 400, "validation_failed")
  })

  test("a file over 5 MB is refused, though one over the JSON limit is read", async () => {
    const padding = `<!-- ${"x".repeat(400 * 1024)} -->`
    const large = statement(`${padding}${THREE_LINES}`)
    expect((await upload(large)).status).toBe(200)
    const tooLarge = statement(`<!-- ${"x".repeat(5 * 1024 * 1024)} -->${THREE_LINES}`)
    await expectStatus(await upload(tooLarge), 400, "validation_failed")
  })

  test("the sample files read the same through the route", async () => {
    const sample = readFileSync(new URL("./ofx-samples/quickbooks.qbo", import.meta.url), "utf8")
    const wallet = await newWallet({ shownAsOwed: true })
    // The samples share one made-up account, so only the first upload of it can pick a Wallet.
    const response = await upload({ text: sample, name: "card.qbo" }, wallet.id)
    expect(response.status).toBe(200)
    const result = uploadDone.parse(await response.json())
    expect(result.inserted.map((row) => row.amountCents).toSorted((a, b) => a - b)).toEqual([
      -1999, 500,
    ])
  })
})

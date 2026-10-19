import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import {
  financesOccurrences,
  financesSchedules,
  financesTransactions,
} from "#server/db/schema/index.ts"
import {
  accountRow,
  categoryRow,
  transactionRow,
  transactionRows,
  walletRow,
} from "#shared/finances/schemas.ts"
import { newId } from "#shared/ids.ts"
import { MAX_QUERY_IDS } from "#shared/schemas/query.ts"

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

async function newWallet() {
  counter += 1
  const response = await server.app.request(
    "/api/finances/wallets",
    json("POST", { id: newId(), name: `Spending wallet ${counter}` }, headers),
  )
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json())
}

async function newAccount() {
  counter += 1
  const response = await server.app.request(
    "/api/finances/accounts",
    json("POST", { id: newId(), name: `Made-up payee ${counter}` }, headers),
  )
  expect(response.status).toBe(201)
  return accountRow.parse(await response.json())
}

async function newCategory() {
  counter += 1
  const response = await server.app.request(
    "/api/finances/categories",
    json("POST", { id: newId(), name: `Made-up category ${counter}` }, headers),
  )
  expect(response.status).toBe(201)
  return categoryRow.parse(await response.json())
}

function create(body: unknown, as = headers) {
  return server.app.request("/api/finances/transactions", json("POST", body, as))
}

async function created(
  walletId: string,
  date: string,
  amountCents: number,
  more: Record<string, unknown> = {},
) {
  const response = await create({
    id: newId(),
    status: "actual",
    walletId,
    date,
    amountCents,
    ...more,
  })
  expect(response.status).toBe(201)
  return transactionRow.parse(await response.json())
}

/** An uploaded Actual, as the upload slice will store one. */
async function imported(walletId: string, date: string, amountCents: number) {
  const [row] = await server.db
    .insert(financesTransactions)
    .values({
      status: "actual",
      walletId,
      date,
      amountCents,
      source: "ofx",
      sourceKey: `FITID-${newId()}`,
      bankDescription: "MADE-UP STORE 123",
    })
    .returning()
  return row!
}

function patch(id: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/transactions/${id}`, json("PATCH", body, as))
}

function remove(id: string, as = headers) {
  return server.app.request(`/api/finances/transactions/${id}`, { method: "DELETE", headers: as })
}

function queryResponse(body: unknown, as = headers) {
  return server.app.request("/api/finances/transactions/query", json("POST", body, as))
}

async function query(body: unknown) {
  const response = await queryResponse(body)
  expect(response.status).toBe(200)
  return transactionRows.parse(await response.json()).rows
}

async function idsOf(body: unknown) {
  return (await query(body)).map((row) => row.id)
}

function expectStatus(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  return expect(response.json()).resolves.toMatchObject({ error: { code } })
}

describe("access", () => {
  test("without Finances access every Transaction route is 403 forbidden_app", async () => {
    const guest = (await server.signedInAccount({ apps: [] })).headers
    const wallet = await newWallet()
    const { id } = await created(wallet.id, "2026-09-01", -100)
    const responses = [
      await queryResponse({}, guest),
      await create(
        { id: newId(), status: "actual", walletId: wallet.id, date: "2026-09-02", amountCents: 1 },
        guest,
      ),
      await patch(id, { amountCents: 5 }, guest),
      await remove(id, guest),
    ]
    for (const response of responses) await expectStatus(response, 403, "forbidden_app")
  })

  test("the Admin reaches the Transaction routes without an access row", async () => {
    const admin = (await server.signedInAccount({ role: "admin" })).headers
    const wallet = await newWallet()
    const id = newId()
    const response = await create(
      { id, status: "planned", walletId: wallet.id, date: "2026-09-01", amountCents: -1 },
      admin,
    )
    expect(response.status).toBe(201)
    expect((await queryResponse({ walletId: wallet.id }, admin)).status).toBe(200)
    expect((await patch(id, { note: "Changed by the Admin" }, admin)).status).toBe(200)
    expect((await remove(id, admin)).status).toBe(200)
  })

  test("without a session they are 401", async () => {
    const response = await server.app.request("/api/finances/transactions/query", json("POST", {}))
    expect(response.status).toBe(401)
  })
})

describe("create", () => {
  test("a hand-entered Actual is stored as manual and never goes to To review", async () => {
    const wallet = await newWallet()
    const account = await newAccount()
    const category = await newCategory()
    const input = {
      id: newId(),
      status: "actual",
      walletId: wallet.id,
      date: "2026-10-01",
      amountCents: -4_250,
      accountId: account.id,
      categoryId: category.id,
      note: "Made-up groceries",
    }
    const response = await create(input)
    expect(response.status).toBe(201)
    const row = transactionRow.parse(await response.json())
    expect(row).toMatchObject({
      ...input,
      source: "manual",
      bankDescription: null,
      ignored: false,
      reconciledActualId: null,
    })
    expect(row.reviewedAt).not.toBeNull()
    expect(await query({ ids: [input.id] })).toEqual([row])
    expect(await query({ walletId: wallet.id, unreviewed: true })).toEqual([])
  })

  test("a one-off Planned has no source and no Account, Category or note unless given", async () => {
    const wallet = await newWallet()
    const id = newId()
    const response = await create({
      id,
      status: "planned",
      walletId: wallet.id,
      date: "2026-11-01",
      amountCents: 50_000,
    })
    expect(response.status).toBe(201)
    expect(transactionRow.parse(await response.json())).toMatchObject({
      id,
      status: "planned",
      source: null,
      reviewedAt: null,
      accountId: null,
      categoryId: null,
      note: "",
    })
  })

  test("an id already used is 409 conflict", async () => {
    const wallet = await newWallet()
    const first = await created(wallet.id, "2026-10-01", -1)
    const response = await create({
      id: first.id,
      status: "actual",
      walletId: wallet.id,
      date: "2026-10-02",
      amountCents: -2,
    })
    await expectStatus(response, 409, "conflict")
  })

  test("an unknown Wallet, Account or Category is 400 validation_failed", async () => {
    const wallet = await newWallet()
    const valid = { status: "actual", walletId: wallet.id, date: "2026-10-01", amountCents: -1 }
    for (const body of [
      { ...valid, walletId: newId() },
      { ...valid, accountId: newId() },
      { ...valid, categoryId: newId() },
    ]) {
      await expectStatus(await create({ id: newId(), ...body }), 400, "validation_failed")
    }
  })

  test("a bad status, date or Amount, or a field only uploads set, is 400", async () => {
    const wallet = await newWallet()
    const valid = { status: "actual", walletId: wallet.id, date: "2026-10-01", amountCents: -1 }
    for (const body of [
      { ...valid, status: "pending" },
      { ...valid, date: "10/01/2026" },
      { ...valid, amountCents: 1.5 },
      { ...valid, source: "ofx" },
      { ...valid, sourceKey: "FITID" },
      { ...valid, ignored: true },
      { ...valid, reviewedAt: null },
    ]) {
      const response = await create({ id: newId(), ...body })
      expect(response.status, JSON.stringify(body)).toBe(400)
    }
  })
})

describe("query", () => {
  test("filters by Wallet, date range and status, ordered by date either way", async () => {
    const wallet = await newWallet()
    const other = await newWallet()
    const a = await created(wallet.id, "2026-10-03", -1)
    const b = await created(wallet.id, "2026-10-01", -1)
    const c = await created(wallet.id, "2026-10-05", -1, { status: "planned" })
    await created(other.id, "2026-10-02", -1)

    expect(await idsOf({ walletId: wallet.id })).toEqual([b.id, a.id, c.id])
    expect(await idsOf({ walletId: wallet.id, order: "dateDesc" })).toEqual([c.id, a.id, b.id])
    expect(
      await idsOf({ walletId: wallet.id, dateFrom: "2026-10-02", dateTo: "2026-10-04" }),
    ).toEqual([a.id])
    expect(await idsOf({ walletId: wallet.id, status: "planned" })).toEqual([c.id])
    expect(await idsOf({ walletId: wallet.id, status: "actual" })).toEqual([b.id, a.id])
  })

  test("a query without a limit that matches more than the cap is refused, never cut short", async () => {
    const wallet = await newWallet()
    const rows = Array.from({ length: MAX_QUERY_IDS + 1 }, () => ({
      id: newId(),
      status: "actual" as const,
      walletId: wallet.id,
      date: "2026-10-01",
      amountCents: -1,
      source: "manual" as const,
    }))
    for (let start = 0; start < rows.length; start += 1000) {
      await server.db.insert(financesTransactions).values(rows.slice(start, start + 1000))
    }

    await expectStatus(await queryResponse({ walletId: wallet.id }), 400, "validation_failed")
    expect(await idsOf({ walletId: wallet.id, limit: MAX_QUERY_IDS })).toHaveLength(MAX_QUERY_IDS)
  })

  test("filters by Category, null meaning Uncategorised", async () => {
    const wallet = await newWallet()
    const category = await newCategory()
    const labelled = await created(wallet.id, "2026-10-01", -1, { categoryId: category.id })
    const bare = await created(wallet.id, "2026-10-02", -1)
    expect(await idsOf({ walletId: wallet.id, categoryId: category.id })).toEqual([labelled.id])
    expect(await idsOf({ walletId: wallet.id, categoryId: null })).toEqual([bare.id])
  })

  test("unreviewed keeps imported Actuals no one has reviewed; ignored rows only on request", async () => {
    const wallet = await newWallet()
    await created(wallet.id, "2026-10-01", -1)
    const line = await imported(wallet.id, "2026-10-02", -2)
    const gone = await imported(wallet.id, "2026-10-03", -3)
    expect((await remove(gone.id)).status).toBe(200)

    expect(await idsOf({ walletId: wallet.id, unreviewed: true })).toEqual([line.id])
    expect(await idsOf({ walletId: wallet.id, status: "actual" })).toHaveLength(2)
    expect(
      await idsOf({ walletId: wallet.id, status: "actual", includeIgnored: true }),
    ).toHaveLength(3)
  })

  test("loads a page at a time with limit and after, in the requested order", async () => {
    const wallet = await newWallet()
    for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"]) {
      await created(wallet.id, date, -1)
    }
    const page = { walletId: wallet.id, order: "dateDesc", limit: 2 }
    const first = await query(page)
    expect(first.map((row) => row.date)).toEqual(["2026-08-05", "2026-08-04"])
    const second = await query({ ...page, after: first[1]!.id })
    expect(second.map((row) => row.date)).toEqual(["2026-08-03", "2026-08-02"])
    const third = await query({ ...page, after: second[1]!.id })
    expect(third.map((row) => row.date)).toEqual(["2026-08-01"])
  })

  test("rejects any filter outside the fixed set", async () => {
    for (const body of [
      { archived: false },
      { amountCents: 1 },
      { source: "ofx" },
      { order: "amountDesc" },
      { status: "pending" },
      { dateFrom: "yesterday" },
      { limit: 0 },
    ]) {
      const response = await queryResponse(body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
    }
  })
})

describe("update", () => {
  test("changes every field of a hand-entered row and returns the full row", async () => {
    const wallet = await newWallet()
    const elsewhere = await newWallet()
    const account = await newAccount()
    const category = await newCategory()
    const row = await created(wallet.id, "2026-10-01", -1)
    const changes = {
      walletId: elsewhere.id,
      date: "2026-10-02",
      amountCents: 2_500,
      accountId: account.id,
      categoryId: category.id,
      note: "Made-up refund",
    }
    const response = await patch(row.id, changes)
    expect(response.status).toBe(200)
    const updated = transactionRow.parse(await response.json())
    expect(updated).toMatchObject({ id: row.id, status: "actual", ...changes })
    expect(await query({ ids: [row.id] })).toEqual([updated])

    const cleared = transactionRow.parse(
      await (await patch(row.id, { accountId: null, categoryId: null, note: "" })).json(),
    )
    expect(cleared).toMatchObject({ accountId: null, categoryId: null, note: "" })
  })

  test("an imported Actual keeps its amount, date and Wallet but takes new labels", async () => {
    const wallet = await newWallet()
    const category = await newCategory()
    const line = await imported(wallet.id, "2026-10-01", -1_000)
    for (const body of [
      { amountCents: -1 },
      { date: "2026-10-02" },
      { walletId: (await newWallet()).id },
    ]) {
      await expectStatus(await patch(line.id, body), 400, "validation_failed")
    }
    const response = await patch(line.id, { categoryId: category.id, note: "Made-up note" })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ categoryId: category.id, amountCents: -1_000 })
    // Sending the stored values back unchanged is not a change.
    expect((await patch(line.id, { amountCents: -1_000, date: "2026-10-01" })).status).toBe(200)
  })

  test("the status cannot change, an empty patch is 400, an unknown id 404, a bad link 400", async () => {
    const wallet = await newWallet()
    const row = await created(wallet.id, "2026-10-01", -1)
    expect((await patch(row.id, { status: "planned" })).status).toBe(400)
    expect((await patch(row.id, {})).status).toBe(400)
    expect((await patch(newId(), { amountCents: 1 })).status).toBe(404)
    await expectStatus(await patch(row.id, { categoryId: newId() }), 400, "validation_failed")
  })
})

describe("delete", () => {
  test("removes a hand-entered row and returns it", async () => {
    const wallet = await newWallet()
    const row = await created(wallet.id, "2026-10-01", -1)
    const response = await remove(row.id)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: row.id })
    expect(await query({ ids: [row.id], includeIgnored: true })).toEqual([])
    expect((await remove(row.id)).status).toBe(404)
  })

  test("an imported Actual is kept as ignored, so a re-upload does not add it again", async () => {
    const wallet = await newWallet()
    const line = await imported(wallet.id, "2026-10-01", -1)
    const response = await remove(line.id)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: line.id, ignored: true })
    expect(await query({ ids: [line.id] })).toEqual([])
    expect(await query({ ids: [line.id], includeIgnored: true })).toHaveLength(1)
  })

  test("an Actual an Occurrence is Reconciled to cannot be deleted", async () => {
    const wallet = await newWallet()
    const actual = await created(wallet.id, "2026-10-01", -1_000)
    const [schedule] = await server.db
      .insert(financesSchedules)
      .values({
        walletId: wallet.id,
        amountCents: -1_000,
        unit: "month",
        every: 1,
        startDate: "2026-10-01",
      })
      .returning()
    await server.db.insert(financesOccurrences).values({
      scheduleId: schedule!.id,
      nominalDate: "2026-10-01",
      reconciledTransactionId: actual.id,
    })
    await expectStatus(await remove(actual.id), 409, "conflict")
  })

  test("an imported Actual a one-off Planned is Reconciled to is not ignored", async () => {
    const wallet = await newWallet()
    const line = await imported(wallet.id, "2026-10-01", -1_000)
    await server.db.insert(financesTransactions).values({
      status: "planned",
      walletId: wallet.id,
      date: "2026-10-01",
      amountCents: -1_000,
      reconciledActualId: line.id,
    })
    await expectStatus(await remove(line.id), 409, "conflict")
    expect(await query({ ids: [line.id] })).toHaveLength(1)
  })

  test("a Wallet with Transactions cannot be deleted; it is archived instead", async () => {
    const wallet = await newWallet()
    await created(wallet.id, "2026-10-01", -1)
    const response = await server.app.request(`/api/finances/wallets/${wallet.id}`, {
      method: "DELETE",
      headers,
    })
    await expectStatus(response, 409, "conflict")
  })
})

describe("the Occurrence link", () => {
  test("an Occurrence can only be Reconciled to a Transaction that exists", async () => {
    const wallet = await newWallet()
    const [schedule] = await server.db
      .insert(financesSchedules)
      .values({
        walletId: wallet.id,
        amountCents: -1,
        unit: "month",
        every: 1,
        startDate: "2026-10-01",
      })
      .returning()
    await expect(
      server.db.insert(financesOccurrences).values({
        scheduleId: schedule!.id,
        nominalDate: "2026-10-01",
        reconciledTransactionId: newId(),
      }),
    ).rejects.toThrow()
  })
})

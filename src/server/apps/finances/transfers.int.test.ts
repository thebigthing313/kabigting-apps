import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import {
  financesOccurrences,
  financesSchedules,
  financesTransfers,
} from "#server/db/schema/index.ts"
import {
  accountRow,
  categoryRow,
  transferRow,
  transferRows,
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

async function newWallet() {
  counter += 1
  const response = await server.app.request(
    "/api/finances/wallets",
    json("POST", { id: newId(), name: `Transfer wallet ${counter}` }, headers),
  )
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json())
}

async function newAccount() {
  counter += 1
  const response = await server.app.request(
    "/api/finances/accounts",
    json("POST", { id: newId(), name: `Made-up card issuer ${counter}` }, headers),
  )
  expect(response.status).toBe(201)
  return accountRow.parse(await response.json())
}

/** Two fresh Wallets: money moves from the first to the second. */
async function twoWallets() {
  return { from: await newWallet(), to: await newWallet() }
}

function create(body: unknown, as = headers) {
  return server.app.request("/api/finances/transfers", json("POST", body, as))
}

async function created(
  fromWalletId: string,
  toWalletId: string,
  date: string,
  amountCents: number,
  more: Record<string, unknown> = {},
) {
  const response = await create({
    id: newId(),
    status: "actual",
    fromWalletId,
    toWalletId,
    date,
    amountCents,
    ...more,
  })
  expect(response.status).toBe(201)
  return transferRow.parse(await response.json())
}

/** An Actual Transfer whose from side came from an upload, as the upload slice will store one. */
async function imported(fromWalletId: string, toWalletId: string, date: string, cents: number) {
  const [row] = await server.db
    .insert(financesTransfers)
    .values({
      status: "actual",
      fromWalletId,
      toWalletId,
      date,
      amountCents: cents,
      fromSource: "ofx",
      fromSourceKey: `FITID-${newId()}`,
      fromBankDescription: "MADE-UP CARD PAYMENT",
    })
    .returning()
  return row!
}

function patch(id: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/transfers/${id}`, json("PATCH", body, as))
}

function remove(id: string, as = headers) {
  return server.app.request(`/api/finances/transfers/${id}`, { method: "DELETE", headers: as })
}

function queryResponse(body: unknown, as = headers) {
  return server.app.request("/api/finances/transfers/query", json("POST", body, as))
}

async function query(body: unknown) {
  const response = await queryResponse(body)
  expect(response.status).toBe(200)
  return transferRows.parse(await response.json()).rows
}

async function idsOf(body: unknown) {
  return (await query(body)).map((row) => row.id)
}

function expectStatus(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  return expect(response.json()).resolves.toMatchObject({ error: { code } })
}

describe("access", () => {
  test("without Finances access every Transfer route is 403 forbidden_app", async () => {
    const guest = (await server.signedInAccount({ apps: [] })).headers
    const { from, to } = await twoWallets()
    const { id } = await created(from.id, to.id, "2026-09-01", 100)
    const responses = [
      await queryResponse({}, guest),
      await create(
        {
          id: newId(),
          status: "actual",
          fromWalletId: from.id,
          toWalletId: to.id,
          date: "2026-09-02",
          amountCents: 1,
        },
        guest,
      ),
      await patch(id, { amountCents: 5 }, guest),
      await remove(id, guest),
    ]
    for (const response of responses) await expectStatus(response, 403, "forbidden_app")
  })

  test("the Admin reaches the Transfer routes without an access row", async () => {
    const admin = (await server.signedInAccount({ role: "admin" })).headers
    const { from, to } = await twoWallets()
    const id = newId()
    const body = {
      id,
      status: "planned",
      fromWalletId: from.id,
      toWalletId: to.id,
      date: "2026-09-01",
      amountCents: 1,
    }
    expect((await create(body, admin)).status).toBe(201)
    expect((await queryResponse({ walletId: from.id }, admin)).status).toBe(200)
    expect((await patch(id, { note: "Changed by the Admin" }, admin)).status).toBe(200)
    expect((await remove(id, admin)).status).toBe(200)
  })

  test("without a session they are 401", async () => {
    const response = await server.app.request("/api/finances/transfers/query", json("POST", {}))
    expect(response.status).toBe(401)
  })
})

describe("create", () => {
  test("a hand-entered Actual Transfer is stored as manual on both sides", async () => {
    const { from, to } = await twoWallets()
    const account = await newAccount()
    const input = {
      id: newId(),
      status: "actual",
      fromWalletId: from.id,
      toWalletId: to.id,
      date: "2026-10-01",
      amountCents: 25_000,
      accountId: account.id,
      note: "Made-up card payment",
    }
    const response = await create(input)
    expect(response.status).toBe(201)
    const row = transferRow.parse(await response.json())
    expect(row).toMatchObject({
      ...input,
      fromSource: "manual",
      toSource: "manual",
      fromBankDescription: null,
      toBankDescription: null,
      ignored: false,
      reconciledActualId: null,
    })
    expect(await query({ ids: [input.id] })).toEqual([row])
  })

  test("a one-off Planned Transfer has no sources and no Account or note unless given", async () => {
    const { from, to } = await twoWallets()
    const id = newId()
    const response = await create({
      id,
      status: "planned",
      fromWalletId: from.id,
      toWalletId: to.id,
      date: "2026-11-01",
      amountCents: 10_000,
    })
    expect(response.status).toBe(201)
    expect(transferRow.parse(await response.json())).toMatchObject({
      id,
      status: "planned",
      fromSource: null,
      toSource: null,
      accountId: null,
      note: "",
    })
  })

  test("a Transfer cannot carry a Category", async () => {
    const { from, to } = await twoWallets()
    const category = await server.app.request(
      "/api/finances/categories",
      json("POST", { id: newId(), name: "Made-up label for a Transfer" }, headers),
    )
    const { id: categoryId } = categoryRow.parse(await category.json())
    const response = await create({
      id: newId(),
      status: "actual",
      fromWalletId: from.id,
      toWalletId: to.id,
      date: "2026-10-01",
      amountCents: 1,
      categoryId,
    })
    await expectStatus(response, 400, "validation_failed")
  })

  test("an id already used is 409 conflict", async () => {
    const { from, to } = await twoWallets()
    const first = await created(from.id, to.id, "2026-10-01", 1)
    const response = await create({
      id: first.id,
      status: "actual",
      fromWalletId: from.id,
      toWalletId: to.id,
      date: "2026-10-02",
      amountCents: 2,
    })
    await expectStatus(response, 409, "conflict")
  })

  test("an unknown Wallet or Account is 400 validation_failed", async () => {
    const { from, to } = await twoWallets()
    const valid = {
      status: "actual",
      fromWalletId: from.id,
      toWalletId: to.id,
      date: "2026-10-01",
      amountCents: 1,
    }
    for (const body of [
      { ...valid, fromWalletId: newId() },
      { ...valid, toWalletId: newId() },
      { ...valid, accountId: newId() },
    ]) {
      await expectStatus(await create({ id: newId(), ...body }), 400, "validation_failed")
    }
  })

  test("the same Wallet twice, a zero or negative Amount, or an upload-only field is 400", async () => {
    const { from, to } = await twoWallets()
    const valid = {
      status: "actual",
      fromWalletId: from.id,
      toWalletId: to.id,
      date: "2026-10-01",
      amountCents: 1,
    }
    for (const body of [
      { ...valid, toWalletId: from.id },
      { ...valid, amountCents: 0 },
      { ...valid, amountCents: -100 },
      { ...valid, status: "pending" },
      { ...valid, date: "10/01/2026" },
      { ...valid, fromSource: "ofx" },
      { ...valid, toSourceKey: "FITID" },
      { ...valid, ignored: true },
    ]) {
      const response = await create({ id: newId(), ...body })
      expect(response.status, JSON.stringify(body)).toBe(400)
    }
  })
})

describe("query", () => {
  test("a Wallet's Transfers are those out of it and into it, by date either way", async () => {
    const { from, to } = await twoWallets()
    const third = await newWallet()
    const out = await created(from.id, to.id, "2026-10-03", 1)
    const into = await created(third.id, from.id, "2026-10-01", 1)
    const planned = await created(from.id, third.id, "2026-10-05", 1, { status: "planned" })
    const elsewhere = await created(to.id, third.id, "2026-10-02", 1)

    expect(await idsOf({ walletId: from.id })).toEqual([into.id, out.id, planned.id])
    expect(await idsOf({ walletId: from.id, order: "dateDesc" })).toEqual([
      planned.id,
      out.id,
      into.id,
    ])
    expect(await idsOf({ walletId: to.id })).toEqual([elsewhere.id, out.id])
    expect(
      await idsOf({ walletId: from.id, dateFrom: "2026-10-02", dateTo: "2026-10-04" }),
    ).toEqual([out.id])
    expect(await idsOf({ walletId: from.id, status: "planned" })).toEqual([planned.id])
    expect(await idsOf({ walletId: from.id, status: "actual" })).toEqual([into.id, out.id])
  })

  test("ignored rows only on request", async () => {
    const { from, to } = await twoWallets()
    const kept = await created(from.id, to.id, "2026-10-01", 1)
    const gone = await imported(from.id, to.id, "2026-10-02", 2)
    expect((await remove(gone.id)).status).toBe(200)
    expect(await idsOf({ walletId: to.id })).toEqual([kept.id])
    expect(await idsOf({ walletId: to.id, includeIgnored: true })).toEqual([kept.id, gone.id])
  })

  test("loads a page at a time with limit and after", async () => {
    const { from, to } = await twoWallets()
    for (const date of ["2026-08-01", "2026-08-02", "2026-08-03"]) {
      await created(from.id, to.id, date, 1)
    }
    const page = { walletId: to.id, order: "dateDesc", limit: 2 }
    const first = await query(page)
    expect(first.map((row) => row.date)).toEqual(["2026-08-03", "2026-08-02"])
    const second = await query({ ...page, after: first[1]!.id })
    expect(second.map((row) => row.date)).toEqual(["2026-08-01"])
  })

  test("rejects any filter outside the fixed set, and the Category and To review filters", async () => {
    for (const body of [
      { categoryId: null },
      { categoryId: newId() },
      { unreviewed: true },
      { fromWalletId: newId() },
      { amountCents: 1 },
      { order: "amountDesc" },
      { status: "pending" },
      { limit: 0 },
    ]) {
      const response = await queryResponse(body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
    }
  })
})

describe("update", () => {
  test("changes every field of a hand-entered Transfer and returns the full row", async () => {
    const { from, to } = await twoWallets()
    const third = await newWallet()
    const account = await newAccount()
    const row = await created(from.id, to.id, "2026-10-01", 1)
    const changes = {
      fromWalletId: third.id,
      toWalletId: from.id,
      date: "2026-10-02",
      amountCents: 2_500,
      accountId: account.id,
      note: "Made-up savings move",
    }
    const response = await patch(row.id, changes)
    expect(response.status).toBe(200)
    const updated = transferRow.parse(await response.json())
    expect(updated).toMatchObject({ id: row.id, status: "actual", ...changes })
    expect(await query({ ids: [row.id] })).toEqual([updated])
  })

  test("moving one side onto the other Wallet is 400", async () => {
    const { from, to } = await twoWallets()
    const row = await created(from.id, to.id, "2026-10-01", 1)
    await expectStatus(await patch(row.id, { toWalletId: from.id }), 400, "validation_failed")
    await expectStatus(await patch(row.id, { fromWalletId: to.id }), 400, "validation_failed")
  })

  test("a Category, a status, a negative Amount or an empty patch is 400; an unknown id 404", async () => {
    const { from, to } = await twoWallets()
    const row = await created(from.id, to.id, "2026-10-01", 1)
    expect((await patch(row.id, { categoryId: null })).status).toBe(400)
    expect((await patch(row.id, { status: "planned" })).status).toBe(400)
    expect((await patch(row.id, { amountCents: -1 })).status).toBe(400)
    expect((await patch(row.id, {})).status).toBe(400)
    expect((await patch(newId(), { amountCents: 1 })).status).toBe(404)
    await expectStatus(await patch(row.id, { accountId: newId() }), 400, "validation_failed")
  })

  test("an imported side keeps its Wallet, the amount and the date, but labels change", async () => {
    const { from, to } = await twoWallets()
    const line = await imported(from.id, to.id, "2026-10-01", 1_000)
    for (const body of [
      { amountCents: 1 },
      { date: "2026-10-02" },
      { fromWalletId: (await newWallet()).id },
    ]) {
      await expectStatus(await patch(line.id, body), 400, "validation_failed")
    }
    const response = await patch(line.id, { note: "Made-up note" })
    expect(response.status).toBe(200)
    // The side still to arrive may yet be put on another Wallet.
    expect((await patch(line.id, { toWalletId: (await newWallet()).id })).status).toBe(200)
    expect((await patch(line.id, { amountCents: 1_000, date: "2026-10-01" })).status).toBe(200)
  })
})

describe("delete", () => {
  test("removes a hand-entered Transfer and returns it", async () => {
    const { from, to } = await twoWallets()
    const row = await created(from.id, to.id, "2026-10-01", 1)
    const response = await remove(row.id)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: row.id })
    expect(await query({ ids: [row.id], includeIgnored: true })).toEqual([])
    expect((await remove(row.id)).status).toBe(404)
  })

  test("an imported Transfer is kept as ignored", async () => {
    const { from, to } = await twoWallets()
    const line = await imported(from.id, to.id, "2026-10-01", 1)
    const response = await remove(line.id)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: line.id, ignored: true })
  })

  test("an Actual Transfer something is Reconciled to cannot be deleted", async () => {
    const { from, to } = await twoWallets()
    const actual = await created(from.id, to.id, "2026-10-01", 1_000)
    const [schedule] = await server.db
      .insert(financesSchedules)
      .values({
        walletId: from.id,
        toWalletId: to.id,
        amountCents: 1_000,
        unit: "month",
        every: 1,
        startDate: "2026-10-01",
      })
      .returning()
    await server.db.insert(financesOccurrences).values({
      scheduleId: schedule!.id,
      nominalDate: "2026-10-01",
      reconciledTransferId: actual.id,
    })
    await expectStatus(await remove(actual.id), 409, "conflict")

    const line = await imported(from.id, to.id, "2026-10-02", 500)
    await server.db.insert(financesTransfers).values({
      status: "planned",
      fromWalletId: from.id,
      toWalletId: to.id,
      date: "2026-10-02",
      amountCents: 500,
      reconciledActualId: line.id,
    })
    await expectStatus(await remove(line.id), 409, "conflict")
    expect(await query({ ids: [line.id] })).toHaveLength(1)
  })

  test("a Wallet with Transfers cannot be deleted; it is archived instead", async () => {
    const { from, to } = await twoWallets()
    await created(from.id, to.id, "2026-10-01", 1)
    for (const wallet of [from, to]) {
      const response = await server.app.request(`/api/finances/wallets/${wallet.id}`, {
        method: "DELETE",
        headers,
      })
      await expectStatus(response, 409, "conflict")
    }
  })
})

describe("the Occurrence link", () => {
  test("an Occurrence can only be Reconciled to a Transfer that exists", async () => {
    const { from, to } = await twoWallets()
    const [schedule] = await server.db
      .insert(financesSchedules)
      .values({
        walletId: from.id,
        toWalletId: to.id,
        amountCents: 1,
        unit: "month",
        every: 1,
        startDate: "2026-10-01",
      })
      .returning()
    await expect(
      server.db.insert(financesOccurrences).values({
        scheduleId: schedule!.id,
        nominalDate: "2026-10-01",
        reconciledTransferId: newId(),
      }),
    ).rejects.toThrow()
  })
})

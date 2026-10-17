import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import { balanceCheckRow, balanceCheckRows, walletRow } from "#shared/finances/schemas.ts"
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
    json("POST", { id: newId(), name: `Checked wallet ${counter}` }, headers),
  )
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json())
}

function create(body: unknown, as = headers) {
  return server.app.request("/api/finances/balance-checks", json("POST", body, as))
}

async function created(walletId: string, date: string, amountCents: number) {
  const response = await create({ id: newId(), walletId, date, amountCents })
  expect(response.status).toBe(201)
  return balanceCheckRow.parse(await response.json())
}

function patch(id: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/balance-checks/${id}`, json("PATCH", body, as))
}

function remove(id: string, as = headers) {
  return server.app.request(`/api/finances/balance-checks/${id}`, {
    method: "DELETE",
    headers: as,
  })
}

function queryResponse(body: unknown, as = headers) {
  return server.app.request("/api/finances/balance-checks/query", json("POST", body, as))
}

async function query(body: unknown) {
  const response = await queryResponse(body)
  expect(response.status).toBe(200)
  return balanceCheckRows.parse(await response.json()).rows
}

async function datesOf(body: unknown) {
  return (await query(body)).map((row) => row.date)
}

describe("access", () => {
  test("without Finances access every Balance check route is 403 forbidden_app", async () => {
    const guest = (await server.signedInAccount({ apps: [] })).headers
    const wallet = await newWallet()
    const { id } = await created(wallet.id, "2026-09-01", 100)
    const responses = [
      await queryResponse({}, guest),
      await create({ id: newId(), walletId: wallet.id, date: "2026-09-02", amountCents: 1 }, guest),
      await patch(id, { amountCents: 5 }, guest),
      await remove(id, guest),
    ]
    for (const response of responses) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
    }
  })

  test("the Admin reaches the Balance check routes without an access row", async () => {
    const admin = (await server.signedInAccount({ role: "admin" })).headers
    const wallet = await newWallet()
    const response = await create(
      { id: newId(), walletId: wallet.id, date: "2026-09-01", amountCents: 1 },
      admin,
    )
    expect(response.status).toBe(201)
    expect((await queryResponse({ walletId: wallet.id }, admin)).status).toBe(200)
  })

  test("without a session they are 401", async () => {
    const response = await server.app.request(
      "/api/finances/balance-checks/query",
      json("POST", {}),
    )
    expect(response.status).toBe(401)
  })
})

describe("create", () => {
  test("stores the check under the client's id and returns the stored row", async () => {
    const wallet = await newWallet()
    const input = { id: newId(), walletId: wallet.id, date: "2026-10-01", amountCents: -42_317 }
    const response = await create(input)
    expect(response.status).toBe(201)
    const row = balanceCheckRow.parse(await response.json())
    expect(row).toMatchObject(input)
    expect(await query({ ids: [input.id] })).toEqual([row])
  })

  test("a second check on the same date replaces the first", async () => {
    const wallet = await newWallet()
    const first = await created(wallet.id, "2026-10-01", 10_000)
    const response = await create({
      id: newId(),
      walletId: wallet.id,
      date: "2026-10-01",
      amountCents: 12_345,
    })
    expect(response.status).toBe(201)
    const replaced = balanceCheckRow.parse(await response.json())
    expect(replaced).toMatchObject({ id: first.id, amountCents: 12_345 })
    expect(await query({ walletId: wallet.id })).toEqual([replaced])
  })

  test("the same date on another Wallet is a separate check", async () => {
    const one = await newWallet()
    const two = await newWallet()
    await created(one.id, "2026-10-01", 1)
    await created(two.id, "2026-10-01", 2)
    expect(await datesOf({ walletId: two.id })).toEqual(["2026-10-01"])
  })

  test("an id already used by another check is 409 conflict", async () => {
    const wallet = await newWallet()
    const first = await created(wallet.id, "2026-10-01", 1)
    const response = await create({
      id: first.id,
      walletId: wallet.id,
      date: "2026-10-02",
      amountCents: 2,
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
  })

  test("an unknown Wallet is 404", async () => {
    const response = await create({
      id: newId(),
      walletId: newId(),
      date: "2026-10-01",
      amountCents: 1,
    })
    expect(response.status).toBe(404)
  })

  test("a bad date, a fractional Amount or an unknown field is 400 validation_failed", async () => {
    const wallet = await newWallet()
    const valid = { id: newId(), walletId: wallet.id, date: "2026-10-01", amountCents: 1 }
    for (const body of [
      { ...valid, date: "2026-13-01" },
      { ...valid, date: "10/01/2026" },
      { ...valid, amountCents: 1.5 },
      { ...valid, note: "extra" },
    ]) {
      const response = await create(body)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
    }
  })
})

describe("query", () => {
  test("filters by Wallet and date range, ordered by date either way", async () => {
    const wallet = await newWallet()
    const other = await newWallet()
    for (const date of ["2026-10-03", "2026-10-01", "2026-10-05", "2026-10-04"]) {
      await created(wallet.id, date, 1)
    }
    await created(other.id, "2026-10-02", 1)

    expect(await datesOf({ walletId: wallet.id })).toEqual([
      "2026-10-01",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ])
    expect(await datesOf({ walletId: wallet.id, order: "dateDesc" })).toEqual([
      "2026-10-05",
      "2026-10-04",
      "2026-10-03",
      "2026-10-01",
    ])
    expect(
      await datesOf({ walletId: wallet.id, dateFrom: "2026-10-03", dateTo: "2026-10-04" }),
    ).toEqual(["2026-10-03", "2026-10-04"])
  })

  test("loads a page at a time with limit and after, in the requested order", async () => {
    const wallet = await newWallet()
    for (const date of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04", "2026-08-05"]) {
      await created(wallet.id, date, 1)
    }
    const page = { walletId: wallet.id, order: "dateDesc", limit: 2 }
    const first = await query(page)
    expect(first.map((row) => row.date)).toEqual(["2026-08-05", "2026-08-04"])
    const second = await query({ ...page, after: first[1]!.id })
    expect(second.map((row) => row.date)).toEqual(["2026-08-03", "2026-08-02"])
    const third = await query({ ...page, after: second[1]!.id })
    expect(third.map((row) => row.date)).toEqual(["2026-08-01"])
  })

  test("paging after a row that no longer exists is 400 validation_failed", async () => {
    const response = await queryResponse({ after: newId(), order: "dateDesc" })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
  })

  test("rejects any filter outside the fixed set, and those that do not apply", async () => {
    for (const body of [
      { archived: false },
      { amountCents: 1 },
      { order: "amountDesc" },
      { categoryId: null },
      { status: "actual" },
      { unreviewed: true },
      { includeIgnored: true },
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
  test("changes the Amount and date and returns the full row", async () => {
    const wallet = await newWallet()
    const row = await created(wallet.id, "2026-10-01", 1)
    const response = await patch(row.id, { date: "2026-10-02", amountCents: -500 })
    expect(response.status).toBe(200)
    const updated = balanceCheckRow.parse(await response.json())
    expect(updated).toMatchObject({ id: row.id, date: "2026-10-02", amountCents: -500 })
    expect(await query({ ids: [row.id] })).toEqual([updated])
  })

  test("moving onto a date that already has a check is 409 conflict", async () => {
    const wallet = await newWallet()
    await created(wallet.id, "2026-10-01", 1)
    const second = await created(wallet.id, "2026-10-02", 2)
    const response = await patch(second.id, { date: "2026-10-01" })
    expect(response.status).toBe(409)
  })

  test("the Wallet cannot be changed, an empty patch is 400 and an unknown id is 404", async () => {
    const wallet = await newWallet()
    const row = await created(wallet.id, "2026-10-01", 1)
    expect((await patch(row.id, { walletId: (await newWallet()).id })).status).toBe(400)
    expect((await patch(row.id, {})).status).toBe(400)
    expect((await patch(newId(), { amountCents: 1 })).status).toBe(404)
  })
})

describe("delete", () => {
  test("removes the check and returns the deleted row", async () => {
    const wallet = await newWallet()
    const row = await created(wallet.id, "2026-10-01", 1)
    const response = await remove(row.id)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: row.id })
    expect(await query({ ids: [row.id] })).toEqual([])
    expect((await remove(row.id)).status).toBe(404)
  })

  test("a Wallet with a Balance check cannot be deleted; it is archived instead", async () => {
    const wallet = await newWallet()
    await created(wallet.id, "2026-10-01", 1)
    const response = await server.app.request(`/api/finances/wallets/${wallet.id}`, {
      method: "DELETE",
      headers,
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
  })
})

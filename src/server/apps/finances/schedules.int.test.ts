import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { scheduleRow, scheduleRows } from "#shared/finances/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let headers: Headers
let noAccessHeaders: Headers
let adminHeaders: Headers
let checking: string
let card: string
let landlord: string
let housing: string

let counter = 0

/** Adds a made-up named row of a Finances resource and returns its id. */
async function named(resource: "wallets" | "accounts" | "categories") {
  counter += 1
  const id = newId()
  const response = await server.app.request(
    `/api/finances/${resource}`,
    json("POST", { id, name: `Test ${resource} ${counter}` }, headers),
  )
  expect(response.status).toBe(201)
  return id
}

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
  noAccessHeaders = (await server.signedInAccount()).headers
  adminHeaders = (await server.signedInAccount({ role: "admin" })).headers
  checking = await named("wallets")
  card = await named("wallets")
  landlord = await named("accounts")
  housing = await named("categories")
})

afterAll(async () => {
  await server.close()
})

/** A made-up monthly rent Schedule on checking. */
function rent(overrides: Record<string, unknown> = {}) {
  return {
    id: newId(),
    walletId: checking,
    accountId: landlord,
    amountCents: -150_000,
    unit: "month",
    every: 1,
    startDate: "2026-11-01",
    categoryId: housing,
    ...overrides,
  }
}

/** A made-up card payment: a Transfer from checking to the card. */
function cardPayment(overrides: Record<string, unknown> = {}) {
  return {
    id: newId(),
    walletId: checking,
    toWalletId: card,
    amountCents: 20_000,
    unit: "month",
    every: 1,
    startDate: "2026-11-20",
    ...overrides,
  }
}

async function create(body: unknown, as = headers) {
  return server.app.request("/api/finances/schedules", json("POST", body, as))
}

async function created(body: unknown) {
  const response = await create(body)
  expect(response.status).toBe(201)
  return scheduleRow.parse(await response.json())
}

async function patch(scheduleId: string, body: unknown) {
  return server.app.request(`/api/finances/schedules/${scheduleId}`, json("PATCH", body, headers))
}

async function remove(path: string) {
  return server.app.request(`/api/finances/${path}`, { method: "DELETE", headers })
}

async function query(body: unknown = {}, as = headers) {
  const response = await server.app.request("/api/finances/schedules/query", json("POST", body, as))
  expect(response.status).toBe(200)
  return scheduleRows.parse(await response.json()).rows
}

async function expectInvalid(response: Response) {
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
}

describe("access", () => {
  test("an Account without Finances access is refused", async () => {
    const response = await create(rent(), noAccessHeaders)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
  })

  test("the Admin, with no access row, adds and reads Schedules", async () => {
    const input = rent()
    expect((await create(input, adminHeaders)).status).toBe(201)
    expect((await query({ ids: [input.id] }, adminHeaders)).map((row) => row.id)).toEqual([
      input.id,
    ])
  })
})

describe("create", () => {
  test("stores a Transaction Schedule under the client's id and returns the full row", async () => {
    const input = rent({ endDate: "2027-10-01", note: "  Lease  " })
    const row = await created(input)
    expect(row).toEqual({
      ...input,
      toWalletId: null,
      note: "Lease",
      predecessorId: null,
      createdAt: expect.stringMatching(/Z$/),
      updatedAt: expect.stringMatching(/Z$/),
    })
    expect(await query({ ids: [input.id] })).toEqual([row])
  })

  test("stores a Transfer Schedule with no Account or Category", async () => {
    const row = await created(cardPayment({ unit: "week", every: 2 }))
    expect(row).toMatchObject({
      toWalletId: card,
      accountId: null,
      categoryId: null,
      unit: "week",
      every: 2,
      endDate: null,
      note: "",
    })
  })

  test("a Transfer Schedule with a Category is refused", async () => {
    await expectInvalid(await create(cardPayment({ categoryId: housing })))
  })

  test("a Transfer to the same Wallet is refused", async () => {
    await expectInvalid(await create(cardPayment({ toWalletId: checking })))
  })

  test("a Transfer moves a positive amount", async () => {
    await expectInvalid(await create(cardPayment({ amountCents: -20_000 })))
    await expectInvalid(await create(cardPayment({ amountCents: 0 })))
  })

  test("an end date before the start date is refused", async () => {
    await expectInvalid(await create(rent({ endDate: "2026-10-31" })))
  })

  test("it repeats at least every 1 week or month", async () => {
    await expectInvalid(await create(rent({ every: 0 })))
    await expectInvalid(await create(rent({ unit: "year" })))
  })

  test("an unknown Wallet, Account or Category is refused", async () => {
    await expectInvalid(await create(rent({ walletId: newId() })))
    await expectInvalid(await create(rent({ accountId: newId() })))
    await expectInvalid(await create(rent({ categoryId: newId() })))
    await expectInvalid(await create(cardPayment({ toWalletId: newId() })))
  })

  test("a duplicate id is 409 conflict and leaves the original alone", async () => {
    const input = rent()
    await created(input)
    const response = await create({ ...input, amountCents: -1 })
    expect(response.status).toBe(409)
    expect((await query({ ids: [input.id] }))[0]?.amountCents).toBe(-150_000)
  })
})

describe("update", () => {
  test("changes the Account, Category and note and returns the full row", async () => {
    const before = await created(rent())
    const otherAccount = await named("accounts")
    const response = await patch(before.id, {
      accountId: otherAccount,
      categoryId: null,
      note: "New lease",
    })
    expect(response.status).toBe(200)
    expect(scheduleRow.parse(await response.json())).toMatchObject({
      id: before.id,
      accountId: otherAccount,
      categoryId: null,
      note: "New lease",
      amountCents: before.amountCents,
    })
  })

  test("giving a Transfer Schedule a Category is refused", async () => {
    const transfer = await created(cardPayment())
    await expectInvalid(await patch(transfer.id, { categoryId: housing }))
    expect((await query({ ids: [transfer.id] }))[0]?.categoryId).toBeNull()
  })

  test("terms are not changed in place", async () => {
    const row = await created(rent())
    await expectInvalid(await patch(row.id, { amountCents: -1 }))
  })

  test("an unknown id is 404", async () => {
    const response = await patch(newId(), { note: "Nobody" })
    expect(response.status).toBe(404)
  })
})

describe("delete", () => {
  test("removes a Schedule and returns it", async () => {
    const row = await created(rent())
    const response = await remove(`schedules/${row.id}`)
    expect(response.status).toBe(200)
    expect(scheduleRow.parse(await response.json()).id).toBe(row.id)
    expect(await query({ ids: [row.id] })).toEqual([])
  })

  test("an unknown id is 404", async () => {
    expect((await remove(`schedules/${newId()}`)).status).toBe(404)
  })

  test("a Wallet or Account a Schedule uses can't be deleted", async () => {
    const wallet = await named("wallets")
    const account = await named("accounts")
    await created(rent({ walletId: wallet, accountId: account }))
    expect((await remove(`wallets/${wallet}`)).status).toBe(409)
    expect((await remove(`accounts/${account}`)).status).toBe(409)
  })
})

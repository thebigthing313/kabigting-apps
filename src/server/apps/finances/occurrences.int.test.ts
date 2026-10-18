import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import { occurrenceRow, occurrenceRows, reconcileResult } from "#shared/finances/schemas.ts"
import { newId } from "#shared/ids.ts"

let server: TestServer
let headers: Headers
let noAccessHeaders: Headers
let adminHeaders: Headers
let checking: string
let card: string

let counter = 0

async function post(path: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/${path}`, json("POST", body, as))
}

async function wallet() {
  counter += 1
  const id = newId()
  expect((await post("wallets", { id, name: `Test wallet ${counter}` })).status).toBe(201)
  return id
}

/** A made-up Schedule; rent on the 1st unless the body says otherwise. Returns its id. */
async function schedule(body: Record<string, unknown> = {}) {
  const id = newId()
  const response = await post("schedules", {
    id,
    walletId: checking,
    amountCents: -150_000,
    unit: "month",
    every: 1,
    startDate: "2026-11-01",
    ...body,
  })
  expect(response.status).toBe(201)
  return id
}

function cardPayment() {
  return schedule({ toWalletId: card, amountCents: 20_000, startDate: "2026-11-20" })
}

async function create(body: unknown, as = headers) {
  return post("occurrences", body, as)
}

async function created(body: Record<string, unknown>) {
  const response = await create({ id: newId(), ...body })
  expect(response.status).toBe(201)
  return occurrenceRow.parse(await response.json())
}

async function patch(occurrenceId: string, body: unknown) {
  return server.app.request(
    `/api/finances/occurrences/${occurrenceId}`,
    json("PATCH", body, headers),
  )
}

async function remove(path: string) {
  return server.app.request(`/api/finances/${path}`, { method: "DELETE", headers })
}

async function query(body: unknown = {}, as = headers) {
  const response = await post("occurrences/query", body, as)
  expect(response.status).toBe(200)
  return occurrenceRows.parse(await response.json()).rows
}

async function expectInvalid(response: Response) {
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
}

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
  noAccessHeaders = (await server.signedInAccount()).headers
  adminHeaders = (await server.signedInAccount({ role: "admin" })).headers
  checking = await wallet()
  card = await wallet()
})

afterAll(async () => {
  await server.close()
})

describe("access", () => {
  test("an Account without Finances access is refused", async () => {
    const scheduleId = await schedule()
    const response = await create(
      { id: newId(), scheduleId, nominalDate: "2026-12-01", skipped: true },
      noAccessHeaders,
    )
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
  })

  test("the Admin, with no access row, overrides and reads Occurrences", async () => {
    const scheduleId = await schedule()
    const id = newId()
    const response = await create(
      { id, scheduleId, nominalDate: "2026-12-01", skipped: true },
      adminHeaders,
    )
    expect(response.status).toBe(201)
    expect((await query({ ids: [id] }, adminHeaders)).map((row) => row.id)).toEqual([id])
  })
})

describe("create", () => {
  test("stores an override under the client's id and returns the full row", async () => {
    const scheduleId = await schedule()
    const id = newId()
    const response = await create({
      id,
      scheduleId,
      nominalDate: "2027-01-01",
      overrideAmountCents: -155_000,
      overrideDate: "2027-01-04",
    })
    expect(response.status).toBe(201)
    const row = occurrenceRow.parse(await response.json())
    expect(row).toEqual({
      id,
      scheduleId,
      nominalDate: "2027-01-01",
      overrideAmountCents: -155_000,
      overrideDate: "2027-01-04",
      skipped: false,
      reconciledTransactionId: null,
      reconciledTransferId: null,
      createdAt: expect.stringMatching(/Z$/),
      updatedAt: expect.stringMatching(/Z$/),
    })
    expect(await query({ ids: [id] })).toEqual([row])
  })

  test("a date the Schedule doesn't fall on is refused", async () => {
    const scheduleId = await schedule()
    await expectInvalid(await create({ id: newId(), scheduleId, nominalDate: "2026-12-02" }))
    await expectInvalid(await create({ id: newId(), scheduleId, nominalDate: "2026-10-01" }))
  })

  test("an unknown Schedule is refused", async () => {
    await expectInvalid(
      await create({ id: newId(), scheduleId: newId(), nominalDate: "2026-12-01" }),
    )
  })

  test("a card payment's statement balance is a positive amount", async () => {
    const scheduleId = await cardPayment()
    const base = { scheduleId, nominalDate: "2026-12-20" }
    await expectInvalid(await create({ id: newId(), ...base, overrideAmountCents: -48_210 }))
    await expectInvalid(await create({ id: newId(), ...base, overrideAmountCents: 0 }))
    const row = await created({ ...base, overrideAmountCents: 48_210 })
    expect(row.overrideAmountCents).toBe(48_210)
  })

  test("the same Occurrence twice is a conflict, as is a duplicate id", async () => {
    const scheduleId = await schedule()
    const first = await created({ scheduleId, nominalDate: "2026-12-01", skipped: true })
    const again = await create({
      id: newId(),
      scheduleId,
      nominalDate: "2026-12-01",
      skipped: true,
    })
    expect(again.status).toBe(409)
    const sameId = await create({
      id: first.id,
      scheduleId,
      nominalDate: "2027-01-01",
      skipped: true,
    })
    expect(sameId.status).toBe(409)
  })

  test("an untouched Occurrence isn't stored", async () => {
    const scheduleId = await schedule()
    await expectInvalid(await create({ id: newId(), scheduleId, nominalDate: "2026-12-01" }))
  })

  test("Reconcile links can't be written here", async () => {
    const scheduleId = await schedule()
    await expectInvalid(
      await create({
        id: newId(),
        scheduleId,
        nominalDate: "2026-12-01",
        reconciledTransactionId: newId(),
      }),
    )
  })
})

describe("update", () => {
  test("changes the override and skip and returns the full row", async () => {
    const scheduleId = await schedule()
    const row = await created({ scheduleId, nominalDate: "2026-12-01", skipped: true })
    const response = await patch(row.id, { skipped: false, overrideAmountCents: -140_000 })
    expect(response.status).toBe(200)
    expect(occurrenceRow.parse(await response.json())).toMatchObject({
      id: row.id,
      skipped: false,
      overrideAmountCents: -140_000,
      overrideDate: null,
    })
  })

  test("a card payment's statement balance stays positive", async () => {
    const scheduleId = await cardPayment()
    const row = await created({ scheduleId, nominalDate: "2026-12-20", skipped: true })
    await expectInvalid(await patch(row.id, { overrideAmountCents: -1 }))
    expect((await patch(row.id, { overrideAmountCents: 1 })).status).toBe(200)
  })

  test("an edit that leaves it untouched is refused; deleting puts it back", async () => {
    const scheduleId = await schedule()
    const row = await created({ scheduleId, nominalDate: "2026-12-01", skipped: true })
    await expectInvalid(await patch(row.id, { skipped: false }))
    expect((await query({ ids: [row.id] }))[0]?.skipped).toBe(true)
  })

  test("the nominal date and Schedule can't change", async () => {
    const scheduleId = await schedule()
    const row = await created({ scheduleId, nominalDate: "2026-12-01", skipped: true })
    await expectInvalid(await patch(row.id, { nominalDate: "2027-01-01" }))
  })

  test("an unknown id is 404", async () => {
    expect((await patch(newId(), { skipped: true })).status).toBe(404)
  })
})

describe("delete", () => {
  test("puts the Occurrence back on its Schedule and returns the row", async () => {
    const scheduleId = await schedule()
    const row = await created({ scheduleId, nominalDate: "2026-12-01", overrideDate: "2026-12-03" })
    const response = await remove(`occurrences/${row.id}`)
    expect(response.status).toBe(200)
    expect(occurrenceRow.parse(await response.json()).id).toBe(row.id)
    expect(await query({ ids: [row.id] })).toEqual([])
  })

  test("an unknown id is 404", async () => {
    expect((await remove(`occurrences/${newId()}`)).status).toBe(404)
  })

  test("deleting a Schedule deletes its overrides", async () => {
    const scheduleId = await schedule()
    const row = await created({ scheduleId, nominalDate: "2026-12-01", skipped: true })
    expect((await remove(`schedules/${scheduleId}`)).status).toBe(200)
    expect(await query({ ids: [row.id] })).toEqual([])
  })
})

/** An Occurrence Reconciled to a hand-entered Actual through the Reconcile command. */
async function reconciled() {
  const scheduleId = await schedule()
  const actualId = newId()
  const actual = await post("transactions", {
    id: actualId,
    status: "actual",
    walletId: checking,
    date: "2026-12-01",
    amountCents: -150_000,
  })
  expect(actual.status).toBe(201)
  const response = await post("reconcile", {
    plannedKind: "occurrence",
    plannedRef: { scheduleId, nominalDate: "2026-12-01" },
    actualId,
  })
  expect(response.status).toBe(200)
  const [row] = reconcileResult.parse(await response.json()).occurrences
  if (!row) throw new Error("Nothing was Reconciled")
  return { scheduleId, row }
}

describe("a Reconciled Occurrence", () => {
  test("can't be edited or put back on its Schedule", async () => {
    const { row } = await reconciled()
    expect((await patch(row.id, { overrideAmountCents: -1 })).status).toBe(409)
    expect((await remove(`occurrences/${row.id}`)).status).toBe(409)
    expect((await query({ ids: [row.id] }))[0]?.reconciledTransactionId).not.toBeNull()
  })

  test("keeps its Schedule from being deleted", async () => {
    const { scheduleId } = await reconciled()
    expect((await remove(`schedules/${scheduleId}`)).status).toBe(409)
  })
})

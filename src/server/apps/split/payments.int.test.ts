// Payments: money one Member hands another. Any Member records, changes or deletes any of them;
// each moves two Balances; one that is gone stays gone.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { balances, equalSide, paymentEntry } from "#shared/split/rules.ts"
import {
  categoryRows,
  expenseRows,
  paymentRow,
  paymentRows,
  type PaymentRow,
} from "#shared/split/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

type Signed = { headers: Headers; id: string }

let server: TestServer
let admin: Signed
let ana: Signed
let ben: Signed
let noAccess: Headers

async function account(options: Parameters<TestServer["signedInAccount"]>[0]): Promise<Signed> {
  const { headers, user } = await server.signedInAccount(options)
  return { headers, id: user.id }
}

beforeAll(async () => {
  server = await createTestServer()
  admin = await account({ role: "admin" })
  ana = await account({ apps: ["split"] })
  ben = await account({ apps: ["split"] })
  noAccess = (await account({ apps: ["notes"] })).headers
})

afterAll(async () => {
  await server.close()
})

/** Ben pays Ana $40.00, settling up. */
function fields(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-10-31",
    fromId: ben.id,
    toId: ana.id,
    amount: 4_000,
    note: "",
    ...overrides,
  }
}

function create(payload: unknown, as: Headers = ben.headers) {
  return server.app.request("/api/split/payments", json("POST", payload, as))
}

async function created(overrides: Record<string, unknown> = {}, as = ben) {
  const response = await create({ id: newId(), ...fields(overrides) }, as.headers)
  expect(response.status).toBe(201)
  return paymentRow.parse(await response.json())
}

function put(paymentId: string, body: unknown, as: Headers = ana.headers) {
  return server.app.request(`/api/split/payments/${paymentId}`, json("PUT", body, as))
}

async function changed(paymentId: string, body: unknown, as = ana) {
  const response = await put(paymentId, body, as.headers)
  expect(response.status).toBe(200)
  return paymentRow.parse(await response.json())
}

function remove(paymentId: string, as: Headers = ana.headers) {
  return server.app.request(`/api/split/payments/${paymentId}`, { method: "DELETE", headers: as })
}

async function list(as: Headers = admin.headers): Promise<PaymentRow[]> {
  const response = await server.app.request("/api/split/payments", { headers: as })
  expect(response.status).toBe(200)
  return paymentRows.parse(await response.json()).rows
}

async function listed(paymentId: string): Promise<PaymentRow | undefined> {
  return (await list()).find((row) => row.id === paymentId)
}

/** Every Member's Balance from everything stored, as Split's Home works it out. */
async function currentBalances() {
  const expenses = await server.app.request("/api/split/expenses", { headers: admin.headers })
  return balances(
    [
      ...expenseRows.parse(await expenses.json()).rows,
      ...(await list()).map((payment) => paymentEntry(payment)),
    ],
    [admin.id, ana.id, ben.id],
  )
}

/** Ana paid $90.00 that the three of them owe equally. */
async function anaPaidForEveryone() {
  const response = await server.app.request("/api/split/categories", { headers: ana.headers })
  const general = categoryRows.parse(await response.json()).rows.find((c) => c.name === "General")
  const expense = await server.app.request(
    "/api/split/expenses",
    json(
      "POST",
      {
        id: newId(),
        description: "Groceries run",
        date: "2026-10-30",
        categoryId: general!.id,
        total: 9_000,
        note: "",
        paid: equalSide([ana.id]),
        owed: equalSide([admin.id, ana.id, ben.id]),
      },
      ana.headers,
    ),
  )
  expect(expense.status).toBe(201)
}

describe("App access", () => {
  test("an Account without App access to Split is refused every Payment route", async () => {
    const payment = await created()
    const refused = [
      await server.app.request("/api/split/payments", { headers: noAccess }),
      await create({ id: newId(), ...fields() }, noAccess),
      await put(payment.id, fields({ amount: 1 }), noAccess),
      await remove(payment.id, noAccess),
    ]
    expect(refused.map((response) => response.status)).toEqual([403, 403, 403, 403])
    for (const response of refused) {
      expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
    }
    expect(await listed(payment.id)).toEqual(payment)
  })

  test("signed out, every Payment route is 401", async () => {
    expect((await server.app.request("/api/split/payments")).status).toBe(401)
    expect((await create({ id: newId(), ...fields() }, new Headers())).status).toBe(401)
  })
})

describe("create", () => {
  test("stores a Payment and records who added it and when", async () => {
    const id = newId()
    const response = await create({ id, ...fields({ note: "  Settling up  " }) })
    expect(response.status).toBe(201)
    const payment = paymentRow.parse(await response.json())
    expect(payment).toMatchObject({
      id,
      date: "2026-10-31",
      fromId: ben.id,
      toId: ana.id,
      amount: 4_000,
      note: "Settling up",
      addedBy: ben.id,
      changedBy: ben.id,
    })
    expect(payment.changedAt).toBe(payment.addedAt)
    expect((await list(ana.headers)).find((row) => row.id === id)).toEqual(payment)
  })

  test("moves both Members' Balances by its Amount", async () => {
    await anaPaidForEveryone()
    const before = await currentBalances()
    await created({ fromId: ben.id, toId: ana.id, amount: 3_000 })
    const after = await currentBalances()
    expect(after[ben.id]).toBe(before[ben.id]! + 3_000)
    expect(after[ana.id]).toBe(before[ana.id]! - 3_000)
    expect(after[admin.id]).toBe(before[admin.id])
  })

  test("the Admin is a Member without an access row, on either end", async () => {
    const payment = await created({ fromId: admin.id, toId: ben.id }, admin)
    expect(payment).toMatchObject({ fromId: admin.id, addedBy: admin.id })
  })

  test("a Payment to oneself is refused, and nothing is stored", async () => {
    const id = newId()
    const response = await create({ id, ...fields({ toId: ben.id }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_failed",
        details: [{ path: "toId", message: "Pick two different Members" }],
      },
    })
    expect(await listed(id)).toBeUndefined()
  })

  test.each([0, -4_000])("an Amount of %s is refused", async (amount) => {
    const id = newId()
    const response = await create({ id, ...fields({ amount }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { details: [{ path: "amount", message: "Enter an amount above zero" }] },
    })
    expect(await listed(id)).toBeUndefined()
  })

  test("refuses an Account without App access to Split on either end", async () => {
    const outsider = (await server.signedInAccount({ apps: ["notes"] })).user.id
    const response = await create({ id: newId(), ...fields({ fromId: outsider, toId: outsider }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        details: [
          { path: "fromId", message: "Only Members can be on a Payment" },
          { path: "toId", message: "Only Members can be on a Payment" },
        ],
      },
    })
  })

  test("refuses fields it doesn't know, and a fractional Amount", async () => {
    expect((await create({ id: newId(), ...fields({ categoryId: newId() }) })).status).toBe(400)
    expect((await create({ id: newId(), ...fields({ amount: 40.5 }) })).status).toBe(400)
  })

  test("a repeated id is a conflict and never overwrites", async () => {
    const first = await created()
    const response = await create({ id: first.id, ...fields({ amount: 1, note: "Other" }) })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: { code: "conflict" } })
    expect(await listed(first.id)).toEqual(first)
  })
})

describe("list", () => {
  test("every Member sees every Payment, newest date first", async () => {
    const older = await created({ date: "2026-01-02" })
    const newer = await created({ date: "2027-01-02" }, ana)
    const ids = (await list(ben.headers)).map((row) => row.id)
    expect(ids[0]).toBe(newer.id)
    expect(ids.at(-1)).toBe(older.id)
  })
})

describe("update", () => {
  test("any Member replaces the whole Payment, and it records who changed it and when", async () => {
    const payment = await created({ note: "Settling up" })
    const edited = await changed(
      payment.id,
      fields({ date: "2026-10-30", fromId: ana.id, toId: admin.id, amount: 1_250, note: " Loan " }),
    )
    expect(edited).toMatchObject({
      id: payment.id,
      date: "2026-10-30",
      fromId: ana.id,
      toId: admin.id,
      amount: 1_250,
      note: "Loan",
      addedBy: ben.id,
      addedAt: payment.addedAt,
      changedBy: ana.id,
    })
    expect(Date.parse(edited.changedAt)).toBeGreaterThan(Date.parse(payment.addedAt))
    expect(await listed(payment.id)).toEqual(edited)
  })

  test("two Members saving the same Payment: the last save wins for the whole record", async () => {
    const payment = await created({ note: "Settling up" })
    const bens = await changed(payment.id, fields({ amount: 1_000, note: "Ben's change" }), ben)
    const anas = await changed(payment.id, fields({ date: "2026-10-29" }), ana)
    // Nothing of Ben's save is merged in: Ana's whole record replaced it.
    expect(anas).toMatchObject({ ...fields({ date: "2026-10-29" }), changedBy: ana.id })
    expect(anas.amount).not.toBe(bens.amount)
    expect(Date.parse(anas.changedAt)).toBeGreaterThanOrEqual(Date.parse(bens.changedAt))
    expect(await listed(payment.id)).toEqual(anas)
  })

  test("names every field that blocks the save, and changes nothing", async () => {
    const payment = await created()
    const response = await put(payment.id, fields({ toId: ben.id, amount: 0 }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: {
        code: "validation_failed",
        details: [
          { path: "toId", message: "Pick two different Members" },
          { path: "amount", message: "Enter an amount above zero" },
        ],
      },
    })
    expect(await listed(payment.id)).toEqual(payment)
  })

  test("keeps an Account on it that lost App access, but can't add another", async () => {
    const cy = await account({ apps: ["split"] })
    const dee = await account({ apps: ["split"] })
    const payment = await created({ fromId: cy.id })
    for (const lost of [cy, dee]) {
      const response = await server.app.request(
        `/api/admin/accounts/${lost.id}/apps`,
        json("PUT", { apps: [] }, admin.headers),
      )
      expect(response.status).toBe(200)
    }
    await changed(payment.id, fields({ fromId: cy.id, amount: 4_500 }))
    const response = await put(payment.id, fields({ fromId: cy.id, toId: dee.id }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { details: [{ path: "toId", message: "Only Members can be on a Payment" }] },
    })
  })

  test("a Payment that's gone answers 404 and is never recreated", async () => {
    const id = newId()
    const response = await put(id, fields())
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
    expect(await listed(id)).toBeUndefined()
  })
})

describe("delete", () => {
  test("any Member deletes any Payment for good, and the Balances move back", async () => {
    const before = await currentBalances()
    const payment = await created({ amount: 2_500 })
    const response = await remove(payment.id, admin.headers)
    expect(response.status).toBe(200)
    expect(paymentRow.parse(await response.json())).toEqual(payment)
    expect(await listed(payment.id)).toBeUndefined()
    expect(await currentBalances()).toEqual(before)
  })

  test("a Payment that's gone answers 404, and can't be changed back into being", async () => {
    const payment = await created()
    expect((await remove(payment.id)).status).toBe(200)
    const again = await remove(payment.id)
    expect(again.status).toBe(404)
    expect(await again.json()).toMatchObject({ error: { code: "not_found" } })
    expect((await put(payment.id, fields())).status).toBe(404)
    expect(await listed(payment.id)).toBeUndefined()
  })
})

import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { financesTransactions } from "#server/db/schema/index.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import {
  accountRow,
  categoryRow,
  occurrenceRows,
  reconcileResult,
  scheduleRow,
  transactionRow,
  transactionRows,
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
  const response = await post("wallets", { id: newId(), name: `Review wallet ${counter}` })
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json()).id
}

async function newCategory() {
  counter += 1
  const response = await post("categories", { id: newId(), name: `Review category ${counter}` })
  expect(response.status).toBe(201)
  return categoryRow.parse(await response.json()).id
}

async function newAccount() {
  counter += 1
  const response = await post("accounts", { id: newId(), name: `Review account ${counter}` })
  expect(response.status).toBe(201)
  return accountRow.parse(await response.json()).id
}

/** A hand-entered Actual: made-up groceries on Nov 2. */
async function handEntry(walletId: string, body: Record<string, unknown> = {}) {
  const response = await post("transactions", {
    id: newId(),
    status: "actual",
    walletId,
    date: "2026-11-02",
    amountCents: -4_210,
    ...body,
  })
  expect(response.status).toBe(201)
  return transactionRow.parse(await response.json())
}

/** An unreviewed uploaded line, as an upload stores it. */
async function uploaded(walletId: string, body: { amountCents?: number; date?: string } = {}) {
  const [row] = await server.db
    .insert(financesTransactions)
    .values({
      status: "actual",
      walletId,
      date: "2026-11-03",
      amountCents: -4_210,
      source: "ofx",
      sourceKey: `FITID-${newId()}`,
      bankDescription: "MADE-UP GROCER",
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

async function expectStatus(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  await expect(response.json()).resolves.toMatchObject({ error: { code } })
}

function markReviewed(ids: string[], as?: Headers) {
  return post("transactions/mark-reviewed", { ids }, as)
}

function sameAsHandEntry(lineId: string, handEntryId: string, as?: Headers) {
  return post(`transactions/${lineId}/same-as-hand-entry`, { handEntryId }, as)
}

describe("mark reviewed", () => {
  test("takes uploaded lines out of To review and returns them", async () => {
    const walletId = await newWallet()
    const first = await uploaded(walletId)
    const second = await uploaded(walletId)
    const waiting = await uploaded(walletId)

    const response = await markReviewed([first.id, second.id])
    expect(response.status).toBe(200)
    const { rows } = transactionRows.parse(await response.json())
    expect(rows.map((row) => row.id).toSorted()).toEqual([first.id, second.id].toSorted())
    expect(rows.every((row) => row.reviewedAt !== null)).toBe(true)

    const unreviewed = await transactions({ walletId, unreviewed: true })
    expect(unreviewed.map((row) => row.id)).toEqual([waiting.id])
  })

  test("leaves a line already reviewed as it was", async () => {
    const walletId = await newWallet()
    const line = await uploaded(walletId)
    const [before] = transactionRows.parse(await (await markReviewed([line.id])).json()).rows
    const { rows } = transactionRows.parse(await (await markReviewed([line.id])).json())
    expect(rows).toEqual([])
    const [stored] = await transactions({ ids: [line.id] })
    expect(stored?.reviewedAt).toBe(before?.reviewedAt)
  })

  test("refuses an empty list", async () => {
    await expectStatus(await markReviewed([]), 400, "validation_failed")
  })

  test("needs Finances access; the Admin has it", async () => {
    const walletId = await newWallet()
    const line = await uploaded(walletId)
    await expectStatus(await markReviewed([line.id], noAccessHeaders), 403, "forbidden_app")
    expect((await markReviewed([line.id], adminHeaders)).status).toBe(200)
  })
})

describe("same as a hand entry", () => {
  test("keeps the uploaded line with the hand entry's Account, Category and note", async () => {
    const walletId = await newWallet()
    const accountId = await newAccount()
    const categoryId = await newCategory()
    const hand = await handEntry(walletId, { accountId, categoryId, note: "Weekly shop" })
    const line = await uploaded(walletId)

    const response = await sameAsHandEntry(line.id, hand.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.deletedTransactions).toEqual([hand.id])
    expect(result.transactions).toEqual([
      expect.objectContaining({
        id: line.id,
        accountId,
        categoryId,
        note: "Weekly shop",
        // The bank's amount and date stay the truth.
        amountCents: -4_210,
        date: "2026-11-03",
        bankDescription: "MADE-UP GROCER",
      }),
    ])
    expect(result.transactions[0]?.reviewedAt).not.toBeNull()

    const stored = await transactions({ walletId })
    expect(stored.map((row) => row.id)).toEqual([line.id])
  })

  test("moves the hand entry's Reconcile onto the uploaded line", async () => {
    const walletId = await newWallet()
    const categoryId = await newCategory()
    const scheduleResponse = await post("schedules", {
      id: newId(),
      walletId,
      amountCents: -4_000,
      unit: "month",
      every: 1,
      startDate: "2026-11-01",
      categoryId,
    })
    const schedule = scheduleRow.parse(await scheduleResponse.json())
    const hand = await handEntry(walletId)
    const reconciled = await post("reconcile", {
      plannedKind: "occurrence",
      plannedRef: { scheduleId: schedule.id, nominalDate: "2026-11-01" },
      actualId: hand.id,
    })
    expect(reconciled.status).toBe(200)
    const line = await uploaded(walletId)

    const result = reconcileResult.parse(await (await sameAsHandEntry(line.id, hand.id)).json())
    expect(result.occurrences).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        nominalDate: "2026-11-01",
        reconciledTransactionId: line.id,
      }),
    ])
    const stored = occurrenceRows.parse(await (await post("occurrences/query", {})).json()).rows
    expect(stored.find((row) => row.scheduleId === schedule.id)?.reconciledTransactionId).toBe(
      line.id,
    )
  })

  test("moves a one-off Planned's Reconcile too", async () => {
    const walletId = await newWallet()
    const plannedResponse = await post("transactions", {
      id: newId(),
      status: "planned",
      walletId,
      date: "2026-11-02",
      amountCents: -4_000,
    })
    const planned = transactionRow.parse(await plannedResponse.json())
    const hand = await handEntry(walletId)
    const reconciled = await post("reconcile", {
      plannedKind: "transaction",
      plannedRef: planned.id,
      actualId: hand.id,
    })
    expect(reconciled.status).toBe(200)
    const line = await uploaded(walletId)

    const result = reconcileResult.parse(await (await sameAsHandEntry(line.id, hand.id)).json())
    expect(result.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: planned.id, reconciledActualId: line.id }),
      ]),
    )
  })

  test("refuses what isn't an uploaded line and its hand-entered twin", async () => {
    const walletId = await newWallet()
    const otherWallet = await newWallet()
    const line = await uploaded(walletId)
    const otherLine = await uploaded(walletId)
    const hand = await handEntry(walletId)
    const elsewhere = await handEntry(otherWallet)
    const otherAmount = await handEntry(walletId, { amountCents: -4_211 })
    // The line is dated Nov 3.
    const fourDaysOff = await handEntry(walletId, { date: "2026-11-07" })

    // The hand entry must be hand-entered, in the same Wallet, for the exact amount, within 3
    // days.
    for (const handEntryId of [otherLine.id, elsewhere.id, otherAmount.id, fourDaysOff.id]) {
      await expectStatus(await sameAsHandEntry(line.id, handEntryId), 400, "validation_failed")
    }
    // The line must be an uploaded one.
    await expectStatus(await sameAsHandEntry(hand.id, otherAmount.id), 400, "validation_failed")
    await expectStatus(await sameAsHandEntry(line.id, newId()), 404, "not_found")
    await expectStatus(await sameAsHandEntry(newId(), hand.id), 404, "not_found")

    const stored = await transactions({ walletId })
    expect(stored.map((row) => row.id).toSorted()).toEqual(
      [line.id, otherLine.id, hand.id, otherAmount.id, fourDaysOff.id].toSorted(),
    )
  })

  test("refuses when both are Reconciled", async () => {
    const walletId = await newWallet()
    const plan = async () =>
      transactionRow.parse(
        await (
          await post("transactions", {
            id: newId(),
            status: "planned",
            walletId,
            date: "2026-11-02",
            amountCents: -4_210,
          })
        ).json(),
      )
    const hand = await handEntry(walletId)
    const line = await uploaded(walletId)
    for (const actualId of [hand.id, line.id]) {
      const planned = await plan()
      const reconciled = await post("reconcile", {
        plannedKind: "transaction",
        plannedRef: planned.id,
        actualId,
      })
      expect(reconciled.status).toBe(200)
    }
    await expectStatus(await sameAsHandEntry(line.id, hand.id), 409, "conflict")
  })

  test("needs Finances access; the Admin has it", async () => {
    const walletId = await newWallet()
    const hand = await handEntry(walletId)
    const line = await uploaded(walletId)
    await expectStatus(
      await sameAsHandEntry(line.id, hand.id, noAccessHeaders),
      403,
      "forbidden_app",
    )
    expect((await sameAsHandEntry(line.id, hand.id, adminHeaders)).status).toBe(200)
  })
})

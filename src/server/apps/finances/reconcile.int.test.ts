import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { financesTransactions, financesTransfers } from "#server/db/schema/index.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import {
  categoryRow,
  occurrenceRow,
  occurrenceRows,
  reconcileResult,
  scheduleRow,
  transactionRow,
  transactionRows,
  transferRow,
  transferRows,
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
  const response = await post("wallets", { id: newId(), name: `Reconcile wallet ${counter}` })
  expect(response.status).toBe(201)
  return walletRow.parse(await response.json()).id
}

async function newCategory() {
  counter += 1
  const response = await post("categories", { id: newId(), name: `Reconcile category ${counter}` })
  expect(response.status).toBe(201)
  return categoryRow.parse(await response.json()).id
}

/** Made-up rent on the 1st from Nov 2026, with a Category; returns the stored row. */
async function rent(walletId: string, body: Record<string, unknown> = {}) {
  const response = await post("schedules", {
    id: newId(),
    walletId,
    amountCents: -150_000,
    unit: "month",
    every: 1,
    startDate: "2026-11-01",
    categoryId: await newCategory(),
    ...body,
  })
  expect(response.status).toBe(201)
  return scheduleRow.parse(await response.json())
}

async function transaction(
  walletId: string,
  status: "actual" | "planned",
  body: Record<string, unknown> = {},
) {
  const response = await post("transactions", {
    id: newId(),
    status,
    walletId,
    date: "2026-11-02",
    amountCents: -148_000,
    ...body,
  })
  expect(response.status).toBe(201)
  return transactionRow.parse(await response.json())
}

/** An unreviewed uploaded line, as an upload stores it. */
async function uploaded(walletId: string, body: { amountCents?: number } = {}) {
  const [row] = await server.db
    .insert(financesTransactions)
    .values({
      status: "actual",
      walletId,
      date: "2026-11-02",
      amountCents: -148_000,
      source: "ofx",
      sourceKey: `FITID-${newId()}`,
      bankDescription: "MADE-UP LANDLORD",
      ...body,
    })
    .returning()
  return row!
}

function reconcileOccurrence(
  scheduleId: string,
  nominalDate: string,
  actualId: string,
  as?: Headers,
) {
  return post(
    "reconcile",
    { plannedKind: "occurrence", plannedRef: { scheduleId, nominalDate }, actualId },
    as,
  )
}

function reconcileOneOff(plannedId: string, actualId: string, as?: Headers) {
  return post("reconcile", { plannedKind: "transaction", plannedRef: plannedId, actualId }, as)
}

async function transactions(ids: string[]) {
  const response = await post("transactions/query", { ids })
  return transactionRows.parse(await response.json()).rows
}

async function occurrences() {
  const response = await post("occurrences/query", {})
  return occurrenceRows.parse(await response.json()).rows
}

async function expectStatus(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  await expect(response.json()).resolves.toMatchObject({ error: { code } })
}

describe("reconcile an Occurrence", () => {
  test("stores the link, and the Actual takes the Schedule's Category when it has none", async () => {
    const walletId = await newWallet()
    const schedule = await rent(walletId)
    const actual = await transaction(walletId, "actual")

    const response = await reconcileOccurrence(schedule.id, "2026-11-01", actual.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.occurrences).toEqual([
      expect.objectContaining({
        scheduleId: schedule.id,
        nominalDate: "2026-11-01",
        overrideAmountCents: null,
        reconciledTransactionId: actual.id,
      }),
    ])
    expect(result.deletedOccurrences).toEqual([])
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: actual.id, categoryId: schedule.categoryId }),
    ])
    // The Actual's amount and date are the truth; nothing about it moves.
    const [stored] = await transactions([actual.id])
    expect(stored).toMatchObject({ amountCents: -148_000, date: "2026-11-02" })
    expect(stored?.categoryId).toBe(schedule.categoryId)
  })

  test("keeps the Actual's own Category, and links an overridden Occurrence in place", async () => {
    const walletId = await newWallet()
    const schedule = await rent(walletId)
    const own = await newCategory()
    const actual = await transaction(walletId, "actual", { categoryId: own })
    const override = await post("occurrences", {
      id: newId(),
      scheduleId: schedule.id,
      nominalDate: "2026-12-01",
      overrideAmountCents: -151_000,
    })
    const overridden = occurrenceRow.parse(await override.json())

    const response = await reconcileOccurrence(schedule.id, "2026-12-01", actual.id)
    const result = reconcileResult.parse(await response.json())
    expect(result.occurrences).toEqual([
      expect.objectContaining({
        id: overridden.id,
        overrideAmountCents: -151_000,
        reconciledTransactionId: actual.id,
      }),
    ])
    expect(result.transactions[0]?.categoryId).toBe(own)
  })

  test("sets an uploaded Actual's reviewedAt", async () => {
    const walletId = await newWallet()
    const schedule = await rent(walletId)
    const line = await uploaded(walletId)
    expect(line.reviewedAt).toBeNull()
    const result = reconcileResult.parse(
      await (await reconcileOccurrence(schedule.id, "2026-11-01", line.id)).json(),
    )
    expect(result.transactions[0]?.reviewedAt).not.toBeNull()
  })

  test("is one to one: neither side can be Reconciled twice", async () => {
    const walletId = await newWallet()
    const schedule = await rent(walletId)
    const first = await transaction(walletId, "actual")
    const second = await transaction(walletId, "actual")
    const oneOff = await transaction(walletId, "planned")
    expect((await reconcileOccurrence(schedule.id, "2026-11-01", first.id)).status).toBe(200)

    await expectStatus(
      await reconcileOccurrence(schedule.id, "2026-11-01", second.id),
      409,
      "conflict",
    )
    await expectStatus(
      await reconcileOccurrence(schedule.id, "2026-12-01", first.id),
      409,
      "conflict",
    )
    await expectStatus(await reconcileOneOff(oneOff.id, first.id), 409, "conflict")
    const [planned] = await transactions([oneOff.id])
    expect(planned?.reconciledActualId).toBeNull()
  })

  test("refuses what isn't an outstanding Occurrence of this Wallet's Schedule", async () => {
    const walletId = await newWallet()
    const otherWallet = await newWallet()
    const schedule = await rent(walletId)
    const actual = await transaction(walletId, "actual")
    const elsewhere = await transaction(otherWallet, "actual")
    const skip = await post("occurrences", {
      id: newId(),
      scheduleId: schedule.id,
      nominalDate: "2027-01-01",
      skipped: true,
    })
    expect(skip.status).toBe(201)
    // Not a date the Schedule falls on, or an unknown Schedule.
    await expectStatus(
      await reconcileOccurrence(schedule.id, "2026-11-02", actual.id),
      400,
      "validation_failed",
    )
    await expectStatus(
      await reconcileOccurrence(newId(), "2026-11-01", actual.id),
      404,
      "not_found",
    )
    // A skipped Occurrence is not outstanding.
    await expectStatus(
      await reconcileOccurrence(schedule.id, "2027-01-01", actual.id),
      409,
      "conflict",
    )
    // Another Wallet's Actual.
    await expectStatus(
      await reconcileOccurrence(schedule.id, "2026-11-01", elsewhere.id),
      400,
      "validation_failed",
    )
    const mine = (await occurrences()).filter((row) => row.scheduleId === schedule.id)
    expect(mine.map((row) => row.nominalDate)).toEqual(["2027-01-01"])
  })

  test("refuses a Planned row or an ignored line as the Actual, and an unknown Actual", async () => {
    const walletId = await newWallet()
    const schedule = await rent(walletId)
    const planned = await transaction(walletId, "planned")
    const line = await uploaded(walletId)
    await server.db
      .update(financesTransactions)
      .set({ ignored: true })
      .where(eq(financesTransactions.id, line.id))
    await expectStatus(
      await reconcileOccurrence(schedule.id, "2026-11-01", planned.id),
      400,
      "validation_failed",
    )
    await expectStatus(
      await reconcileOccurrence(schedule.id, "2026-11-01", line.id),
      400,
      "validation_failed",
    )
    await expectStatus(
      await reconcileOccurrence(schedule.id, "2026-11-01", newId()),
      404,
      "not_found",
    )
  })
})

describe("reconcile a one-off Planned", () => {
  test("sets its link, and the Actual takes its Category when it has none", async () => {
    const walletId = await newWallet()
    const categoryId = await newCategory()
    const oneOff = await transaction(walletId, "planned", { date: "2026-11-05", categoryId })
    const actual = await transaction(walletId, "actual")

    const response = await reconcileOneOff(oneOff.id, actual.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.occurrences).toEqual([])
    const byId = new Map(result.transactions.map((row) => [row.id, row]))
    expect(byId.get(oneOff.id)?.reconciledActualId).toBe(actual.id)
    expect(byId.get(actual.id)).toMatchObject({ categoryId, amountCents: -148_000 })
  })

  test("refuses one already Reconciled, an Actual as the Planned, and another Wallet's", async () => {
    const walletId = await newWallet()
    const otherWallet = await newWallet()
    const oneOff = await transaction(walletId, "planned")
    const first = await transaction(walletId, "actual")
    const second = await transaction(walletId, "actual")
    const elsewhere = await transaction(otherWallet, "planned")
    expect((await reconcileOneOff(oneOff.id, first.id)).status).toBe(200)

    await expectStatus(await reconcileOneOff(oneOff.id, second.id), 409, "conflict")
    await expectStatus(await reconcileOneOff(first.id, second.id), 400, "validation_failed")
    await expectStatus(await reconcileOneOff(elsewhere.id, second.id), 400, "validation_failed")
    await expectStatus(await reconcileOneOff(newId(), second.id), 404, "not_found")
  })
})

function unreconcile(actualId: string, as = headers) {
  return post("unreconcile", { actualId }, as)
}

describe("unreconcile", () => {
  test("an Occurrence Reconciled with no override goes back to its Schedule's terms", async () => {
    const walletId = await newWallet()
    const schedule = await rent(walletId)
    const actual = await transaction(walletId, "actual")
    const reconciled = reconcileResult.parse(
      await (await reconcileOccurrence(schedule.id, "2026-11-01", actual.id)).json(),
    )
    const link = reconciled.occurrences[0]!

    const response = await unreconcile(actual.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    // Nothing else was stored on it, so it is computed again.
    expect(result.deletedOccurrences).toEqual([link.id])
    expect(result.occurrences).toEqual([])
    expect((await occurrences()).some((row) => row.id === link.id)).toBe(false)
    // The Actual can be Reconciled again.
    expect((await reconcileOccurrence(schedule.id, "2026-11-01", actual.id)).status).toBe(200)
  })

  test("an overridden Occurrence keeps its previous amount", async () => {
    const walletId = await newWallet()
    const schedule = await rent(walletId)
    const actual = await transaction(walletId, "actual")
    await post("occurrences", {
      id: newId(),
      scheduleId: schedule.id,
      nominalDate: "2026-11-01",
      overrideAmountCents: -151_000,
    })
    await reconcileOccurrence(schedule.id, "2026-11-01", actual.id)

    const result = reconcileResult.parse(await (await unreconcile(actual.id)).json())
    expect(result.deletedOccurrences).toEqual([])
    expect(result.occurrences).toEqual([
      expect.objectContaining({
        nominalDate: "2026-11-01",
        overrideAmountCents: -151_000,
        reconciledTransactionId: null,
      }),
    ])
  })

  test("a one-off Planned is outstanding again at its amount", async () => {
    const walletId = await newWallet()
    const oneOff = await transaction(walletId, "planned", { amountCents: -9_000 })
    const actual = await transaction(walletId, "actual")
    await reconcileOneOff(oneOff.id, actual.id)

    const result = reconcileResult.parse(await (await unreconcile(actual.id)).json())
    expect(result.transactions).toEqual([
      expect.objectContaining({ id: oneOff.id, reconciledActualId: null, amountCents: -9_000 }),
    ])
  })

  test("an Actual Reconciled to nothing is refused", async () => {
    const walletId = await newWallet()
    const actual = await transaction(walletId, "actual")
    await expectStatus(await unreconcile(actual.id), 409, "conflict")
    await expectStatus(await unreconcile(newId()), 404, "not_found")
  })
})

function patch(id: string, body: unknown) {
  return server.app.request(`/api/finances/transactions/${id}`, json("PATCH", body, headers))
}

describe("a Reconciled Actual", () => {
  test("stays in its Wallet, but its amount, date and labels can change", async () => {
    const walletId = await newWallet()
    const otherWallet = await newWallet()
    const schedule = await rent(walletId)
    const actual = await transaction(walletId, "actual")
    const oneOffActual = await transaction(walletId, "actual")
    const oneOff = await transaction(walletId, "planned")
    await reconcileOccurrence(schedule.id, "2026-11-01", actual.id)
    await reconcileOneOff(oneOff.id, oneOffActual.id)

    for (const id of [actual.id, oneOffActual.id, oneOff.id]) {
      await expectStatus(await patch(id, { walletId: otherWallet }), 409, "conflict")
    }
    const changed = await patch(actual.id, { amountCents: -149_000, walletId, note: "Paid" })
    expect(changed.status).toBe(200)
    // Un-Reconciled, it can move.
    await unreconcile(actual.id)
    expect((await patch(actual.id, { walletId: otherWallet })).status).toBe(200)
  })
})

/** A hand-entered Transfer from one Wallet to another. */
async function transfer(
  fromWalletId: string,
  toWalletId: string,
  status: "actual" | "planned",
  body: Record<string, unknown> = {},
) {
  const response = await post("transfers", {
    id: newId(),
    status,
    fromWalletId,
    toWalletId,
    date: "2026-11-02",
    amountCents: 20_000,
    ...body,
  })
  expect(response.status).toBe(201)
  return transferRow.parse(await response.json())
}

/** A made-up card payment: a Transfer Schedule on the 1st from Nov 2026. */
async function cardPayment(fromWalletId: string, toWalletId: string) {
  return rent(fromWalletId, { toWalletId, amountCents: 20_000, categoryId: null })
}

function reconcileTransfer(plannedId: string, actualId: string) {
  return post("reconcile", { plannedKind: "transfer", plannedRef: plannedId, actualId })
}

async function transfers(ids: string[]) {
  const response = await post("transfers/query", { ids, includeIgnored: true })
  return transferRows.parse(await response.json()).rows
}

describe("reconcile to a Planned Transfer", () => {
  test("an Actual Transfer links to a Transfer Schedule's Occurrence", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const schedule = await cardPayment(checking, card)
    const paid = await transfer(checking, card, "actual", { amountCents: 19_500 })

    const response = await reconcileOccurrence(schedule.id, "2026-11-01", paid.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.occurrences).toEqual([
      expect.objectContaining({ reconciledTransferId: paid.id, reconciledTransactionId: null }),
    ])
    expect(result.deletedTransactions).toEqual([])
  })

  test("an Actual Transfer links to a one-off Planned Transfer between the same Wallets", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const planned = await transfer(checking, card, "planned")
    const reversed = await transfer(card, checking, "planned")
    const paid = await transfer(checking, card, "actual")

    await expectStatus(await reconcileTransfer(reversed.id, paid.id), 400, "validation_failed")
    const response = await reconcileTransfer(planned.id, paid.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.transfers).toEqual([
      expect.objectContaining({ id: planned.id, reconciledActualId: paid.id }),
    ])
    // One to one.
    const again = await transfer(checking, card, "actual")
    await expectStatus(await reconcileTransfer(planned.id, again.id), 409, "conflict")
  })

  test("a line on the from Wallet becomes an Actual Transfer, keyed on that side", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const schedule = await cardPayment(checking, card)
    const line = await uploaded(checking, { amountCents: -19_500 })

    const response = await reconcileOccurrence(schedule.id, "2026-11-01", line.id)
    expect(response.status).toBe(200)
    const result = reconcileResult.parse(await response.json())
    expect(result.deletedTransactions).toEqual([line.id])
    const [made] = result.transfers
    expect(made).toMatchObject({
      status: "actual",
      fromWalletId: checking,
      toWalletId: card,
      date: "2026-11-02",
      amountCents: 19_500,
      fromSource: "ofx",
      fromBankDescription: "MADE-UP LANDLORD",
      toSource: null,
    })
    expect(result.occurrences).toEqual([
      expect.objectContaining({ reconciledTransferId: made?.id, reconciledTransactionId: null }),
    ])
    // The line's key moved: the Transaction is gone, and the Transfer holds it.
    expect(await transactions([line.id])).toEqual([])
    const [stored] = await server.db
      .select({ key: financesTransfers.fromSourceKey })
      .from(financesTransfers)
      .where(eq(financesTransfers.id, made!.id))
    expect(stored?.key).toBe(line.sourceKey)
  })

  test("a line on the to Wallet becomes an Actual Transfer keyed on the to side", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const planned = await transfer(checking, card, "planned", { note: "Card payment" })
    const line = await uploaded(card, { amountCents: 20_000 })

    const result = reconcileResult.parse(
      await (await reconcileTransfer(planned.id, line.id)).json(),
    )
    const made = result.transfers.find((row) => row.id !== planned.id)
    expect(made).toMatchObject({
      fromWalletId: checking,
      toWalletId: card,
      fromSource: null,
      toSource: "ofx",
      note: "Card payment",
    })
    expect(result.transfers.find((row) => row.id === planned.id)?.reconciledActualId).toBe(made?.id)
  })

  test("refuses a line moving the wrong way, a line on another Wallet, and a Transfer to a Planned Transaction", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const elsewhere = await newWallet()
    const planned = await transfer(checking, card, "planned")
    const refund = await uploaded(checking, { amountCents: 20_000 })
    const stray = await uploaded(elsewhere, { amountCents: -20_000 })
    const paid = await transfer(checking, card, "actual")
    const oneOff = await transaction(checking, "planned")

    await expectStatus(await reconcileTransfer(planned.id, refund.id), 400, "validation_failed")
    await expectStatus(await reconcileTransfer(planned.id, stray.id), 400, "validation_failed")
    await expectStatus(await reconcileOneOff(oneOff.id, paid.id), 400, "validation_failed")
    await expectStatus(await reconcileTransfer(oneOff.id, paid.id), 404, "not_found")
    expect(await transactions([refund.id, stray.id])).toHaveLength(2)
    expect((await transfers([planned.id]))[0]?.reconciledActualId).toBeNull()
  })

  test("Un-Reconcile frees the Planned Transfer and keeps the Actual Transfer", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const schedule = await cardPayment(checking, card)
    const planned = await transfer(checking, card, "planned")
    const first = await transfer(checking, card, "actual")
    const second = await transfer(checking, card, "actual")
    await reconcileOccurrence(schedule.id, "2026-11-01", first.id)
    await reconcileTransfer(planned.id, second.id)

    const fromOccurrence = reconcileResult.parse(await (await unreconcile(first.id)).json())
    expect(fromOccurrence.deletedOccurrences).toHaveLength(1)
    const fromOneOff = reconcileResult.parse(await (await unreconcile(second.id)).json())
    expect(fromOneOff.transfers).toEqual([
      expect.objectContaining({ id: planned.id, reconciledActualId: null }),
    ])
    expect(await transfers([first.id, second.id])).toHaveLength(2)
  })

  test("a Reconciled Transfer keeps its Wallets", async () => {
    const checking = await newWallet()
    const card = await newWallet()
    const other = await newWallet()
    const planned = await transfer(checking, card, "planned")
    const paid = await transfer(checking, card, "actual")
    await reconcileTransfer(planned.id, paid.id)
    for (const id of [planned.id, paid.id]) {
      const response = await server.app.request(
        `/api/finances/transfers/${id}`,
        json("PATCH", { toWalletId: other }, headers),
      )
      await expectStatus(response, 409, "conflict")
    }
  })
})

describe("access", () => {
  test("both commands need Finances access, which the Admin holds", async () => {
    const walletId = await newWallet()
    const schedule = await rent(walletId)
    const actual = await transaction(walletId, "actual")
    await expectStatus(
      await reconcileOccurrence(schedule.id, "2026-11-01", actual.id, noAccessHeaders),
      403,
      "forbidden_app",
    )
    await expectStatus(await unreconcile(actual.id, noAccessHeaders), 403, "forbidden_app")
    expect(
      (await reconcileOccurrence(schedule.id, "2026-11-01", actual.id, adminHeaders)).status,
    ).toBe(200)
    expect((await unreconcile(actual.id, adminHeaders)).status).toBe(200)
  })

  test("a malformed body is refused", async () => {
    await expectStatus(
      await post("reconcile", { plannedKind: "bill", plannedRef: newId(), actualId: newId() }),
      400,
      "validation_failed",
    )
  })
})

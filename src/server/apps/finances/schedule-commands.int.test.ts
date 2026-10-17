import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { financesOccurrences } from "#server/db/schema/index.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"
import {
  occurrenceRow,
  occurrenceRows,
  scheduleCommandResult,
  scheduleRow,
  scheduleRows,
} from "#shared/finances/schemas.ts"
import { newId } from "#shared/ids.ts"

let server: TestServer
let headers: Headers
let noAccessHeaders: Headers
let adminHeaders: Headers
let checking: string

async function post(path: string, body: unknown, as = headers) {
  return server.app.request(`/api/finances/${path}`, json("POST", body, as))
}

beforeAll(async () => {
  server = await createTestServer()
  headers = (await server.signedInAccount({ apps: ["finances"] })).headers
  noAccessHeaders = (await server.signedInAccount()).headers
  adminHeaders = (await server.signedInAccount({ role: "admin" })).headers
  checking = newId()
  expect((await post("wallets", { id: checking, name: "Test checking" })).status).toBe(201)
})

afterAll(async () => {
  await server.close()
})

/** Made-up rent on the 1st from Nov 2026; returns the stored row. */
async function rent(body: Record<string, unknown> = {}) {
  const response = await post("schedules", {
    id: newId(),
    walletId: checking,
    amountCents: -150_000,
    unit: "month",
    every: 1,
    startDate: "2026-11-01",
    ...body,
  })
  expect(response.status).toBe(201)
  return scheduleRow.parse(await response.json())
}

/** Stores an override on one Occurrence and returns its row. */
async function override(scheduleId: string, nominalDate: string, body = {}) {
  const response = await post("occurrences", {
    id: newId(),
    scheduleId,
    nominalDate,
    overrideAmountCents: -155_000,
    ...body,
  })
  expect(response.status).toBe(201)
  return occurrenceRow.parse(await response.json())
}

/** Reconciling arrives with hand entry; until then the link is written straight to the table. */
async function reconciled(scheduleId: string, nominalDate: string) {
  const row = await override(scheduleId, nominalDate)
  await server.db
    .update(financesOccurrences)
    .set({ overrideAmountCents: null, reconciledTransactionId: newId() })
    .where(eq(financesOccurrences.id, row.id))
  return row
}

async function schedules(ids: string[]) {
  const response = await post("schedules/query", { ids })
  return scheduleRows.parse(await response.json()).rows
}

async function occurrences(ids: string[]) {
  const response = await post("occurrences/query", { ids })
  return occurrenceRows.parse(await response.json()).rows
}

function changeFrom(scheduleId: string, body: unknown, as = headers) {
  return post(`schedules/${scheduleId}/change-from`, body, as)
}

async function expectStatus(response: Response, status: number, code: string) {
  expect(response.status).toBe(status)
  expect(await response.json()).toMatchObject({ error: { code } })
}

describe("change from a date", () => {
  test("ends the Schedule the day before and starts a successor on the new terms", async () => {
    const before = await rent({ note: "Lease" })
    const response = await changeFrom(before.id, {
      date: "2027-03-01",
      changes: { amountCents: -160_000 },
    })
    expect(response.status).toBe(200)
    const result = scheduleCommandResult.parse(await response.json())
    const ended = result.schedules.find((row) => row.id === before.id)
    const successor = result.schedules.find((row) => row.id !== before.id)
    expect(ended).toMatchObject({ endDate: "2027-02-28", amountCents: -150_000 })
    expect(successor).toMatchObject({
      predecessorId: before.id,
      walletId: checking,
      amountCents: -160_000,
      unit: "month",
      every: 1,
      startDate: "2027-03-01",
      endDate: null,
      note: "Lease",
    })
    expect(await schedules([before.id, successor?.id ?? ""])).toHaveLength(2)
  })

  test("earlier Occurrences keep the old terms; later overrides move to the successor", async () => {
    const before = await rent()
    const earlier = await override(before.id, "2027-02-01")
    const movedPast = await override(before.id, "2027-01-01", {
      overrideDate: "2027-03-05",
    })
    const later = await override(before.id, "2027-04-01", { skipped: true })
    const kept = await reconciled(before.id, "2027-05-01")

    const response = await changeFrom(before.id, {
      date: "2027-03-01",
      changes: { amountCents: -160_000 },
    })
    const result = scheduleCommandResult.parse(await response.json())
    const successor = result.schedules.find((row) => row.id !== before.id)
    expect(result.occurrences.map((row) => [row.id, row.scheduleId])).toEqual([
      [later.id, successor?.id],
    ])
    const stored = await occurrences([earlier.id, movedPast.id, later.id, kept.id])
    const owner = new Map(stored.map((row) => [row.id, row.scheduleId]))
    // On or before the day it ends, even when moved past it, an Occurrence stays where it was.
    expect(owner.get(earlier.id)).toBe(before.id)
    expect(owner.get(movedPast.id)).toBe(before.id)
    expect(owner.get(later.id)).toBe(successor?.id)
    // A Reconciled one is never touched.
    expect(owner.get(kept.id)).toBe(before.id)
  })

  test("a new day and frequency start on their own first date", async () => {
    const before = await rent()
    const response = await changeFrom(before.id, {
      date: "2027-03-02",
      changes: { unit: "week", every: 2, startDate: "2027-03-05" },
    })
    const result = scheduleCommandResult.parse(await response.json())
    expect(result.schedules).toEqual([
      expect.objectContaining({ id: before.id, endDate: "2027-03-01" }),
      expect.objectContaining({ unit: "week", every: 2, startDate: "2027-03-05" }),
    ])
  })

  test("a date outside the Schedule's terms is refused, changing nothing", async () => {
    const before = await rent({ endDate: "2027-06-01" })
    await expectStatus(
      await changeFrom(before.id, { date: "2026-11-01", changes: {} }),
      400,
      "validation_failed",
    )
    await expectStatus(
      await changeFrom(before.id, { date: "2027-06-02", changes: {} }),
      400,
      "validation_failed",
    )
    await expectStatus(
      await changeFrom(before.id, { date: "2027-03-01", changes: { startDate: "2027-02-27" } }),
      400,
      "validation_failed",
    )
    await expectStatus(
      await changeFrom(before.id, { date: "2027-03-01", changes: { endDate: "2027-02-01" } }),
      400,
      "validation_failed",
    )
    expect((await schedules([before.id]))[0]?.endDate).toBe("2027-06-01")
  })

  test("only the newest Schedule in a chain changes", async () => {
    const before = await rent()
    expect((await changeFrom(before.id, { date: "2027-03-01", changes: {} })).status).toBe(200)
    await expectStatus(
      await changeFrom(before.id, { date: "2027-01-01", changes: {} }),
      409,
      "conflict",
    )
  })

  test("an unknown Schedule is 404", async () => {
    await expectStatus(
      await changeFrom(newId(), { date: "2027-03-01", changes: {} }),
      404,
      "not_found",
    )
  })

  test("needs Finances access, which the Admin holds", async () => {
    const before = await rent()
    const body = { date: "2027-03-01", changes: {} }
    await expectStatus(await changeFrom(before.id, body, noAccessHeaders), 403, "forbidden_app")
    expect((await changeFrom(before.id, body, adminHeaders)).status).toBe(200)
  })
})

function end(scheduleId: string, body: unknown, as = headers) {
  return post(`schedules/${scheduleId}/end`, body, as)
}

describe("end", () => {
  test("sets the end date and deletes the later overrides it was told about", async () => {
    const schedule = await rent()
    const onEnd = await override(schedule.id, "2027-02-01")
    const after = await override(schedule.id, "2027-03-01", { skipped: true })
    const kept = await reconciled(schedule.id, "2027-04-01")

    const response = await end(schedule.id, {
      endDate: "2027-02-01",
      confirmDeleteOverrides: [after.id],
    })
    expect(response.status).toBe(200)
    const result = scheduleCommandResult.parse(await response.json())
    expect(result.schedules).toEqual([
      expect.objectContaining({ id: schedule.id, endDate: "2027-02-01" }),
    ])
    expect(result.occurrences).toEqual([])
    expect(result.deletedOccurrences).toEqual([after.id])
    const left = await occurrences([onEnd.id, after.id, kept.id])
    expect(left.map((row) => row.id).toSorted()).toEqual([onEnd.id, kept.id].toSorted())
  })

  test("is refused when the list doesn't match the overrides there are", async () => {
    const schedule = await rent()
    const after = await override(schedule.id, "2027-03-01")
    const other = await override(schedule.id, "2027-04-01")
    for (const confirmDeleteOverrides of [[], [after.id], [after.id, other.id, newId()]]) {
      await expectStatus(
        await end(schedule.id, { endDate: "2027-02-01", confirmDeleteOverrides }),
        409,
        "conflict",
      )
    }
    expect(await occurrences([after.id, other.id])).toHaveLength(2)
    expect((await schedules([schedule.id]))[0]?.endDate).toBeNull()
  })

  test("an end date before the start is refused", async () => {
    const schedule = await rent()
    await expectStatus(
      await end(schedule.id, { endDate: "2026-10-31", confirmDeleteOverrides: [] }),
      400,
      "validation_failed",
    )
  })

  test("only the newest Schedule in a chain ends", async () => {
    const schedule = await rent()
    expect((await changeFrom(schedule.id, { date: "2027-03-01", changes: {} })).status).toBe(200)
    await expectStatus(
      await end(schedule.id, { endDate: "2027-01-01", confirmDeleteOverrides: [] }),
      409,
      "conflict",
    )
  })

  test("needs Finances access, which the Admin holds", async () => {
    const schedule = await rent()
    const body = { endDate: "2027-02-01", confirmDeleteOverrides: [] }
    await expectStatus(await end(schedule.id, body, noAccessHeaders), 403, "forbidden_app")
    expect((await end(schedule.id, body, adminHeaders)).status).toBe(200)
  })
})

function patch(scheduleId: string, body: unknown) {
  return server.app.request(`/api/finances/schedules/${scheduleId}`, json("PATCH", body, headers))
}

describe("reopen", () => {
  test("clears the end date", async () => {
    const schedule = await rent({ endDate: "2027-02-01" })
    const response = await patch(schedule.id, { endDate: null })
    expect(response.status).toBe(200)
    expect(scheduleRow.parse(await response.json()).endDate).toBeNull()
  })

  test("only sets the end date to none; End sets a date", async () => {
    const schedule = await rent()
    await expectStatus(
      await patch(schedule.id, { endDate: "2027-02-01" }),
      400,
      "validation_failed",
    )
  })

  test("a Schedule a later one continues can't be reopened", async () => {
    const schedule = await rent()
    expect((await changeFrom(schedule.id, { date: "2027-03-01", changes: {} })).status).toBe(200)
    await expectStatus(await patch(schedule.id, { endDate: null }), 409, "conflict")
    expect((await schedules([schedule.id]))[0]?.endDate).toBe("2027-02-28")
  })
})

function remove(scheduleId: string) {
  return server.app.request(`/api/finances/schedules/${scheduleId}`, { method: "DELETE", headers })
}

/** Rent changed twice, with an override on each Schedule. Newest first. */
async function chain() {
  const first = await rent()
  const second = scheduleCommandResult
    .parse(await (await changeFrom(first.id, { date: "2027-03-01", changes: {} })).json())
    .schedules.find((row) => row.id !== first.id)
  if (!second) throw new Error("No successor")
  const third = scheduleCommandResult
    .parse(await (await changeFrom(second.id, { date: "2027-06-01", changes: {} })).json())
    .schedules.find((row) => row.id !== second.id)
  if (!third) throw new Error("No successor")
  return [third, second, first]
}

describe("delete", () => {
  test("from any Schedule in a chain, deletes the whole chain and its overrides", async () => {
    const [third, second, first] = await chain()
    if (!third || !second || !first) throw new Error("No chain")
    const overrides = [
      await override(first.id, "2027-01-01"),
      await override(second.id, "2027-04-01"),
      await override(third.id, "2027-07-01"),
    ]
    const response = await remove(second.id)
    expect(response.status).toBe(200)
    expect(scheduleRow.parse(await response.json()).id).toBe(second.id)
    expect(await schedules([first.id, second.id, third.id])).toEqual([])
    expect(await occurrences(overrides.map((row) => row.id))).toEqual([])
  })

  test("is refused when anything is Reconciled to the chain, deleting nothing", async () => {
    const [third, second, first] = await chain()
    if (!third || !second || !first) throw new Error("No chain")
    const kept = await reconciled(first.id, "2027-01-01")
    const other = await override(third.id, "2027-07-01")
    await expectStatus(await remove(third.id), 409, "conflict")
    expect(await schedules([first.id, second.id, third.id])).toHaveLength(3)
    expect(await occurrences([kept.id, other.id])).toHaveLength(2)
  })
})

import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { orderItems } from "#shared/notes/items.ts"
import {
  clearedChecked,
  itemRows,
  itemWrite,
  noteRow,
  noteRows,
  type ClearedChecked,
  type ItemRow,
  type NoteRow,
} from "#shared/notes/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let creator: Headers
let someoneElse: Headers
let noAccess: Headers
let admin: Headers
let member: { headers: Headers; id: string }

beforeAll(async () => {
  server = await createTestServer()
  creator = (await server.signedInAccount({ apps: ["notes"] })).headers
  const signedIn = await server.signedInAccount({ apps: ["notes"] })
  member = { headers: signedIn.headers, id: signedIn.user.id }
  someoneElse = (await server.signedInAccount({ apps: ["notes"] })).headers
  noAccess = (await server.signedInAccount({ apps: ["finances"] })).headers
  admin = (await server.signedInAccount({ role: "admin" })).headers
})

afterAll(async () => {
  await server.close()
})

async function makeNote(kind: "checklist" | "text", as = creator): Promise<NoteRow> {
  const response = await server.app.request(
    "/api/notes/notes",
    json("POST", { id: newId(), kind, title: "Groceries" }, as),
  )
  expect(response.status).toBe(201)
  return noteRow.parse(await response.json())
}

/** A Checklist holding the given Items, the checked ones ticked. */
async function checklist(unchecked: string[], checked: string[] = [], as = creator) {
  const note = await makeNote("checklist", as)
  const ids = new Map<string, string>()
  for (const text of [...unchecked, ...checked]) {
    const response = await server.app.request(
      "/api/notes/items",
      json("POST", { id: newId(), noteId: note.id, text }, as),
    )
    expect(response.status).toBe(201)
    ids.set(text, itemWrite.parse(await response.json()).item.id)
  }
  for (const text of checked) await tick(ids.get(text)!, true, as)
  return { note, id: (text: string) => ids.get(text)! }
}

async function tick(itemId: string, checked: boolean, as = creator) {
  const response = await server.app.request(
    `/api/notes/items/${itemId}`,
    json("PATCH", { checked }, as),
  )
  expect(response.status).toBe(200)
}

function clearChecked(noteId: string, itemIds: unknown, as = creator) {
  return server.app.request(
    `/api/notes/notes/${noteId}/clear-checked`,
    json("POST", { itemIds }, as),
  )
}

async function cleared(noteId: string, itemIds: string[]): Promise<ClearedChecked> {
  const response = await clearChecked(noteId, itemIds)
  expect(response.status).toBe(200)
  return clearedChecked.parse(await response.json())
}

async function itemsOf(noteId: string, as = creator) {
  const response = await server.app.request("/api/notes/items", { headers: as })
  expect(response.status).toBe(200)
  const rows = itemRows.parse(await response.json()).rows
  return orderItems(rows.filter((item) => item.noteId === noteId))
}

const texts = (rows: readonly ItemRow[]) => rows.map((row) => row.text)

async function listedNote(noteId: string): Promise<NoteRow | undefined> {
  const response = await server.app.request("/api/notes/notes", { headers: creator })
  return noteRows.parse(await response.json()).rows.find((note) => note.id === noteId)
}

describe("clearing checked Items", () => {
  test("deletes every checked Item sent and leaves the unchecked ones", async () => {
    const { note, id } = await checklist(["Milk", "Eggs"], ["Jam", "Bread"])
    const result = await cleared(note.id, [id("Jam"), id("Bread")])
    expect(result.cleared.toSorted()).toEqual([id("Jam"), id("Bread")].toSorted())
    expect(result.kept).toEqual([])
    const { unchecked, checked } = await itemsOf(note.id)
    expect(texts(unchecked)).toEqual(["Milk", "Eggs"])
    expect(checked).toEqual([])
  })
})

describe("the still-checked rule", () => {
  test("an Item unticked before the clear lands survives, and is reported as stored", async () => {
    const { note, id } = await checklist(["Milk"], ["Jam", "Bread"])
    // The clearer saw Jam and Bread checked; someone else unticks Jam first.
    await tick(id("Jam"), false)
    const result = await cleared(note.id, [id("Jam"), id("Bread")])
    expect(result.cleared).toEqual([id("Bread")])
    expect(result.kept).toEqual([
      expect.objectContaining({ id: id("Jam"), text: "Jam", checked: false, checkedAt: null }),
    ])
    const { unchecked, checked } = await itemsOf(note.id)
    expect(texts(unchecked)).toEqual(["Milk", "Jam"])
    expect(checked).toEqual([])
  })

  test("an untick racing the clear either lands first and survives, or finds the Item gone", async () => {
    const { note, id } = await checklist([], ["Jam"])
    const [untick, clear] = await Promise.all([
      server.app.request(
        `/api/notes/items/${id("Jam")}`,
        json("PATCH", { checked: false }, creator),
      ),
      clearChecked(note.id, [id("Jam")]),
    ])
    expect(clear.status).toBe(200)
    const result = clearedChecked.parse(await clear.json())
    const { unchecked } = await itemsOf(note.id)
    if (untick.status === 200) {
      expect(result.cleared).toEqual([])
      expect(texts(unchecked)).toEqual(["Jam"])
    } else {
      expect(untick.status).toBe(404)
      expect(result.cleared).toEqual([id("Jam")])
      expect(unchecked).toEqual([])
    }
  })

  test("clears racing unticks, edits, moves and deletes never fail, however they interleave", async () => {
    for (let round = 0; round < 40; round += 1) {
      const { note, id } = await checklist(["Milk"], ["Jam", "Bread", "Eggs"])
      const responses = await Promise.all([
        server.app.request(
          `/api/notes/items/${id("Milk")}`,
          json("PATCH", { position: "a" }, creator),
        ),
        server.app.request(
          `/api/notes/items/${id("Jam")}`,
          json("PATCH", { checked: false }, creator),
        ),
        clearChecked(note.id, [id("Jam"), id("Bread"), id("Eggs")]),
        server.app.request(
          `/api/notes/items/${id("Bread")}`,
          json("PATCH", { text: "Rye" }, creator),
        ),
        server.app.request(`/api/notes/items/${id("Eggs")}`, {
          method: "DELETE",
          headers: creator,
        }),
      ])
      for (const response of responses) expect([200, 404]).toContain(response.status)
      expect(responses[2]?.status).toBe(200)
    }
  })

  test("an Item checked that the clearer didn't see stays checked", async () => {
    const { note, id } = await checklist([], ["Jam", "Bread"])
    const result = await cleared(note.id, [id("Jam")])
    expect(result.cleared).toEqual([id("Jam")])
    expect(texts((await itemsOf(note.id)).checked)).toEqual(["Bread"])
  })

  test("ids of another Checklist's Items, or of Items already gone, are ignored", async () => {
    const mine = await checklist([], ["Jam"])
    const other = await checklist([], ["Tent"])
    const gone = newId()
    const result = await cleared(mine.note.id, [mine.id("Jam"), other.id("Tent"), gone])
    expect(result).toMatchObject({ cleared: [mine.id("Jam")], kept: [] })
    expect(texts((await itemsOf(other.note.id)).checked)).toEqual(["Tent"])
  })

  test("clearing again is harmless: nothing more is deleted", async () => {
    const { note, id } = await checklist(["Milk"], ["Jam"])
    const first = await cleared(note.id, [id("Jam")])
    const again = await cleared(note.id, [id("Jam")])
    expect(again).toEqual({ cleared: [], kept: [], noteEditedAt: first.noteEditedAt })
    expect(texts((await itemsOf(note.id)).unchecked)).toEqual(["Milk"])
  })
})

describe("edited at", () => {
  test("moves forward when something is cleared, and is reported", async () => {
    const { note, id } = await checklist([], ["Jam"])
    const before = (await listedNote(note.id))!.editedAt
    const result = await cleared(note.id, [id("Jam")])
    expect(Date.parse(result.noteEditedAt)).toBeGreaterThan(Date.parse(before))
    expect(await listedNote(note.id)).toMatchObject({ editedAt: result.noteEditedAt })
  })

  test("stays put when nothing was still checked", async () => {
    const { note, id } = await checklist(["Milk"], ["Jam"])
    await tick(id("Jam"), false)
    const before = (await listedNote(note.id))!.editedAt
    const result = await cleared(note.id, [id("Jam"), id("Milk")])
    expect(result).toMatchObject({ cleared: [], noteEditedAt: before })
    expect(await listedNote(note.id)).toMatchObject({ editedAt: before })
  })
})

describe("refusals", () => {
  test("a Text note has no Items to clear", async () => {
    const note = await makeNote("text")
    const response = await clearChecked(note.id, [newId()])
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
  })

  test("the ids must be a non-empty list of Item ids", async () => {
    const { note } = await checklist([], ["Jam"])
    expect((await clearChecked(note.id, ["not-an-id"])).status).toBe(400)
    expect((await clearChecked(note.id, undefined)).status).toBe(400)
    expect((await clearChecked(note.id, [])).status).toBe(400)
    expect(texts((await itemsOf(note.id)).checked)).toEqual(["Jam"])
  })

  test("a Checklist that is gone is 404", async () => {
    expect((await clearChecked(newId(), [newId()])).status).toBe(404)
  })

  test("an Account without App access to Notes is refused", async () => {
    const { note, id } = await checklist([], ["Jam"])
    expect((await clearChecked(note.id, [id("Jam")], noAccess)).status).toBe(403)
    expect(texts((await itemsOf(note.id)).checked)).toEqual(["Jam"])
  })

  for (const [who, as] of [
    ["another Account", () => someoneElse],
    ["the Admin", () => admin],
  ] as const) {
    test(`${who}, who can't see the Checklist, gets 404 and clears nothing`, async () => {
      const { note, id } = await checklist([], ["Jam"])
      const before = (await listedNote(note.id))!.editedAt
      const response = await clearChecked(note.id, [id("Jam")], as())
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
      expect(texts((await itemsOf(note.id)).checked)).toEqual(["Jam"])
      expect(await listedNote(note.id)).toMatchObject({ editedAt: before })
    })
  }
})

async function shareWith(noteId: string, accountIds: string[]) {
  const response = await server.app.request(
    `/api/notes/notes/${noteId}/audience`,
    json("PUT", { accountIds }, creator),
  )
  expect(response.status).toBe(200)
}

describe("the Audience", () => {
  test("a member may clear, and it counts as an edit", async () => {
    const { note, id } = await checklist(["Milk"], ["Jam"])
    await shareWith(note.id, [member.id])
    const before = (await listedNote(note.id))!.editedAt
    const response = await clearChecked(note.id, [id("Jam")], member.headers)
    expect(response.status).toBe(200)
    const result = clearedChecked.parse(await response.json())
    expect(result.cleared).toEqual([id("Jam")])
    expect(Date.parse(result.noteEditedAt)).toBeGreaterThan(Date.parse(before))
    const { unchecked, checked } = await itemsOf(note.id)
    expect(texts(unchecked)).toEqual(["Milk"])
    expect(checked).toEqual([])
  })

  test("a member removed from the Audience gets 404 and clears nothing", async () => {
    const { note, id } = await checklist([], ["Jam"])
    await shareWith(note.id, [member.id])
    await shareWith(note.id, [])
    const response = await clearChecked(note.id, [id("Jam")], member.headers)
    expect(response.status).toBe(404)
    expect(texts((await itemsOf(note.id)).checked)).toEqual(["Jam"])
  })
})

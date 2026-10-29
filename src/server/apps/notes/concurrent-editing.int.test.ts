// Two Accounts editing one Note at once: every write is per field and per Item, the last write
// wins with no version check and no conflict, and a write to a target that is gone answers 404
// without bringing it back.
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { itemRows, itemWrite, noteRow, noteRows, type ItemRow } from "#shared/notes/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

type Signed = { headers: Headers; id: string }

let server: TestServer
let creator: Signed
let member: Signed

beforeAll(async () => {
  server = await createTestServer()
  const signed = async () => {
    const { headers, user } = await server.signedInAccount({ apps: ["notes"] })
    return { headers, id: user.id }
  }
  creator = await signed()
  member = await signed()
})

afterAll(async () => {
  await server.close()
})

/** A Note of the Creator's, shared with the member. */
async function sharedNote(body: Record<string, unknown>) {
  const made = await server.app.request(
    "/api/notes/notes",
    json("POST", { id: newId(), ...body }, creator.headers),
  )
  expect(made.status).toBe(201)
  const note = noteRow.parse(await made.json())
  const shared = await server.app.request(
    `/api/notes/notes/${note.id}/audience`,
    json("PUT", { accountIds: [member.id] }, creator.headers),
  )
  expect(shared.status).toBe(200)
  return note
}

const textNote = () => sharedNote({ kind: "text", title: "Trip", body: "Socks" })
const checklist = () => sharedNote({ kind: "checklist", title: "Groceries" })

function patchNote(noteId: string, body: unknown, as: Signed) {
  return server.app.request(`/api/notes/notes/${noteId}`, json("PATCH", body, as.headers))
}

function deleteNote(noteId: string) {
  return server.app.request(`/api/notes/notes/${noteId}`, {
    method: "DELETE",
    headers: creator.headers,
  })
}

function addItem(noteId: string, text: string, as: Signed, id = newId()) {
  return server.app.request("/api/notes/items", json("POST", { id, noteId, text }, as.headers))
}

async function added(noteId: string, text: string): Promise<ItemRow> {
  const response = await addItem(noteId, text, creator)
  expect(response.status).toBe(201)
  return itemWrite.parse(await response.json()).item
}

function patchItem(itemId: string, body: unknown, as: Signed) {
  return server.app.request(`/api/notes/items/${itemId}`, json("PATCH", body, as.headers))
}

function deleteItem(itemId: string, as: Signed) {
  return server.app.request(`/api/notes/items/${itemId}`, {
    method: "DELETE",
    headers: as.headers,
  })
}

async function noteAs(noteId: string, as: Signed) {
  const response = await server.app.request("/api/notes/notes", { headers: as.headers })
  expect(response.status).toBe(200)
  return noteRows.parse(await response.json()).rows.find((note) => note.id === noteId)
}

async function itemsAs(noteId: string, as: Signed) {
  const response = await server.app.request("/api/notes/items", { headers: as.headers })
  expect(response.status).toBe(200)
  return itemRows.parse(await response.json()).rows.filter((item) => item.noteId === noteId)
}

describe("two people editing different parts of a Note both keep their changes", () => {
  test("the title and the body", async () => {
    const note = await textNote()
    const [title, body] = await Promise.all([
      patchNote(note.id, { title: "Beach trip" }, creator),
      patchNote(note.id, { body: "Socks\nSunscreen" }, member),
    ])
    expect([title.status, body.status]).toEqual([200, 200])
    for (const as of [creator, member]) {
      expect(await noteAs(note.id, as)).toMatchObject({
        title: "Beach trip",
        body: "Socks\nSunscreen",
      })
    }
  })

  test("the title and the Items", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    const answers = await Promise.all([
      patchNote(note.id, { title: "Saturday" }, creator),
      patchItem(milk.id, { text: "Oat milk" }, member),
      addItem(note.id, "Eggs", member),
    ])
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 201])
    expect(await noteAs(note.id, creator)).toMatchObject({ title: "Saturday" })
    expect((await itemsAs(note.id, creator)).map((item) => item.text).toSorted()).toEqual([
      "Eggs",
      "Oat milk",
    ])
  })

  test("different Items", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    const eggs = await added(note.id, "Eggs")
    const bread = await added(note.id, "Bread")
    const answers = await Promise.all([
      patchItem(milk.id, { text: "Oat milk" }, creator),
      patchItem(eggs.id, { checked: true }, member),
      deleteItem(bread.id, member),
    ])
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200])
    for (const as of [creator, member]) {
      expect(await itemsAs(note.id, as)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: milk.id, text: "Oat milk", checked: false }),
          expect.objectContaining({ id: eggs.id, text: "Eggs", checked: true }),
        ]),
      )
      expect((await itemsAs(note.id, as)).map((item) => item.id)).not.toContain(bread.id)
    }
  })

  test("one Item's text and its tick", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    await Promise.all([
      patchItem(milk.id, { text: "Oat milk" }, creator),
      patchItem(milk.id, { checked: true }, member),
    ])
    expect(await itemsAs(note.id, member)).toEqual([
      expect.objectContaining({ id: milk.id, text: "Oat milk", checked: true }),
    ])
  })
})

describe("two saves to the same field or Item keep the later one, with no error", () => {
  test("a Note's field", async () => {
    const note = await textNote()
    const first = await patchNote(note.id, { body: "Socks and shoes" }, creator)
    const second = await patchNote(note.id, { body: "Just sandals" }, member)
    expect([first.status, second.status]).toEqual([200, 200])
    expect(await noteAs(note.id, creator)).toMatchObject({ title: "Trip", body: "Just sandals" })

    // And the other way round: whoever saves last wins.
    expect((await patchNote(note.id, { body: "Boots" }, creator)).status).toBe(200)
    expect(await noteAs(note.id, member)).toMatchObject({ body: "Boots" })
  })

  test("an Item's text", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    expect((await patchItem(milk.id, { text: "Oat milk" }, creator)).status).toBe(200)
    const later = await patchItem(milk.id, { text: "Soy milk" }, member)
    expect(later.status).toBe(200)
    expect(itemWrite.parse(await later.json()).item).toMatchObject({ text: "Soy milk" })
    expect(await itemsAs(note.id, creator)).toEqual([
      expect.objectContaining({ id: milk.id, text: "Soy milk" }),
    ])
  })

  test("an Item's tick", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    expect((await patchItem(milk.id, { checked: true }, creator)).status).toBe(200)
    expect((await patchItem(milk.id, { checked: false }, member)).status).toBe(200)
    expect(await itemsAs(note.id, creator)).toEqual([
      expect.objectContaining({ id: milk.id, checked: false, checkedAt: null }),
    ])
  })

  test("saves sent at once all succeed, and the stored text is one of them", async () => {
    const note = await textNote()
    const bodies = ["One", "Two", "Three", "Four"]
    const answers = await Promise.all(
      bodies.map(async (body, index) => patchNote(note.id, { body }, index % 2 ? member : creator)),
    )
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200, 200])
    expect(bodies).toContain((await noteAs(note.id, creator))?.body)
  })
})

describe("a write to a target that is gone answers 404 and brings nothing back", () => {
  test("every write to an Item someone else deleted", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    const eggs = await added(note.id, "Eggs")
    expect((await deleteItem(milk.id, creator)).status).toBe(200)

    const answers = [
      await patchItem(milk.id, { text: "Oat milk" }, member),
      await patchItem(milk.id, { checked: true }, member),
      await patchItem(milk.id, { position: "a" }, member),
      await deleteItem(milk.id, member),
    ]
    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404])
    expect(await answers[0]!.json()).toMatchObject({ error: { code: "not_found" } })
    for (const as of [creator, member]) {
      expect((await itemsAs(note.id, as)).map((item) => item.id)).toEqual([eggs.id])
    }
  })

  test("every write to a Note its Creator deleted, or to its Items", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    expect((await deleteNote(note.id)).status).toBe(200)

    const answers = [
      await patchNote(note.id, { title: "Still here?" }, member),
      await addItem(note.id, "Eggs", member),
      await patchItem(milk.id, { text: "Oat milk" }, member),
      await patchItem(milk.id, { checked: true }, member),
      await deleteItem(milk.id, member),
      await server.app.request(
        `/api/notes/notes/${note.id}/clear-checked`,
        json("POST", { itemIds: [milk.id] }, member.headers),
      ),
    ]
    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404, 404, 404])
    for (const as of [creator, member]) {
      expect(await noteAs(note.id, as)).toBeUndefined()
      expect(await itemsAs(note.id, as)).toEqual([])
    }
  })

  test("every write to a Note no longer shared with the writer", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    const unshared = await server.app.request(
      `/api/notes/notes/${note.id}/audience`,
      json("PUT", { accountIds: [] }, creator.headers),
    )
    expect(unshared.status).toBe(200)

    const answers = [
      await patchNote(note.id, { title: "Mine now" }, member),
      await addItem(note.id, "Eggs", member),
      await patchItem(milk.id, { text: "Oat milk" }, member),
      await deleteItem(milk.id, member),
    ]
    expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404])
    expect(await noteAs(note.id, creator)).toMatchObject({ title: "Groceries" })
    expect(await itemsAs(note.id, creator)).toEqual([
      expect.objectContaining({ id: milk.id, text: "Milk" }),
    ])
  })

  test("a late save of a Text note's body after its Creator deleted it", async () => {
    const note = await textNote()
    expect((await deleteNote(note.id)).status).toBe(200)
    expect((await patchNote(note.id, { body: "Socks" }, member)).status).toBe(404)
    expect((await patchNote(note.id, { body: "Socks" }, creator)).status).toBe(404)
    expect(await noteAs(note.id, creator)).toBeUndefined()
  })
})

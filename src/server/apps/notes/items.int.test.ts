import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { orderItems } from "#shared/notes/items.ts"
import {
  itemRows,
  itemWrite,
  noteRow,
  noteRows,
  type ItemRow,
  type ItemWrite,
  type NoteRow,
} from "#shared/notes/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let creator: Headers
let someoneElse: Headers
let noAccess: Headers
let admin: Headers

beforeAll(async () => {
  server = await createTestServer()
  creator = (await server.signedInAccount({ apps: ["notes"] })).headers
  someoneElse = (await server.signedInAccount({ apps: ["notes"] })).headers
  noAccess = (await server.signedInAccount({ apps: ["finances"] })).headers
  admin = (await server.signedInAccount({ role: "admin" })).headers
})

afterAll(async () => {
  await server.close()
})

async function checklist(title: string | null = "Groceries", as = creator): Promise<NoteRow> {
  const response = await server.app.request(
    "/api/notes/notes",
    json("POST", { id: newId(), kind: "checklist", title }, as),
  )
  expect(response.status).toBe(201)
  return noteRow.parse(await response.json())
}

function addItem(body: Record<string, unknown>, as = creator) {
  return server.app.request("/api/notes/items", json("POST", { id: newId(), ...body }, as))
}

async function added(noteId: string, text: string): Promise<ItemWrite> {
  const response = await addItem({ noteId, text })
  expect(response.status).toBe(201)
  return itemWrite.parse(await response.json())
}

function patchItem(itemId: string, body: unknown, as = creator) {
  return server.app.request(`/api/notes/items/${itemId}`, json("PATCH", body, as))
}

async function patched(itemId: string, body: unknown): Promise<ItemWrite> {
  const response = await patchItem(itemId, body)
  expect(response.status).toBe(200)
  return itemWrite.parse(await response.json())
}

function removeItem(itemId: string, as = creator) {
  return server.app.request(`/api/notes/items/${itemId}`, { method: "DELETE", headers: as })
}

async function items(as = creator): Promise<ItemRow[]> {
  const response = await server.app.request("/api/notes/items", { headers: as })
  expect(response.status).toBe(200)
  return itemRows.parse(await response.json()).rows
}

async function itemsOf(noteId: string, as = creator) {
  return orderItems((await items(as)).filter((item) => item.noteId === noteId))
}

const texts = (rows: readonly ItemRow[]) => rows.map((row) => row.text)

async function listedNote(noteId: string): Promise<NoteRow | undefined> {
  const response = await server.app.request("/api/notes/notes", { headers: creator })
  return noteRows.parse(await response.json()).rows.find((note) => note.id === noteId)
}

describe("a Checklist", () => {
  test("is made with an optional title and no body", async () => {
    expect(await checklist("Packing")).toMatchObject({
      kind: "checklist",
      title: "Packing",
      body: null,
    })
    expect(await checklist(null)).toMatchObject({ kind: "checklist", title: null, body: null })
  })

  test("refuses a body, when made or later, as a validation error", async () => {
    const made = await server.app.request(
      "/api/notes/notes",
      json("POST", { id: newId(), kind: "checklist", body: "Milk" }, creator),
    )
    expect(made.status).toBe(400)

    const note = await checklist()
    const edit = await server.app.request(
      `/api/notes/notes/${note.id}`,
      json("PATCH", { body: "Milk" }, creator),
    )
    expect(edit.status).toBe(400)
    expect(await edit.json()).toMatchObject({ error: { code: "validation_failed" } })
    expect(await listedNote(note.id)).toEqual(note)
  })

  test("still has its title edited", async () => {
    const note = await checklist("Old")
    const edit = await server.app.request(
      `/api/notes/notes/${note.id}`,
      json("PATCH", { title: "New" }, creator),
    )
    expect(edit.status).toBe(200)
    expect(noteRow.parse(await edit.json())).toMatchObject({ title: "New", body: null })
  })

  test("deleting it deletes its Items", async () => {
    const note = await checklist()
    const { item } = await added(note.id, "Milk")
    await server.app.request(`/api/notes/notes/${note.id}`, { method: "DELETE", headers: creator })
    expect((await items()).map((row) => row.id)).not.toContain(item.id)
    expect((await patchItem(item.id, { checked: true })).status).toBe(404)
  })
})

describe("adding Items", () => {
  test("each goes to the bottom of the unchecked Items, unchecked", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    expect(milk.item).toMatchObject({
      noteId: note.id,
      text: "Milk",
      checked: false,
      checkedAt: null,
    })
    await added(note.id, "Eggs")
    await added(note.id, "Bread")
    const { unchecked, checked } = await itemsOf(note.id)
    expect(texts(unchecked)).toEqual(["Milk", "Eggs", "Bread"])
    expect(checked).toEqual([])
  })

  test("below the unchecked Items even when some are checked", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    await added(note.id, "Eggs")
    await patched(milk.item.id, { checked: true })
    await added(note.id, "Bread")
    expect(texts((await itemsOf(note.id)).unchecked)).toEqual(["Eggs", "Bread"])
  })

  test("text is kept exactly, but must be one line", async () => {
    const note = await checklist()
    expect((await added(note.id, "  2 x  milk ")).item.text).toBe("  2 x  milk ")
    expect((await addItem({ noteId: note.id, text: "Milk\nEggs" })).status).toBe(400)
  })

  test("a Text note has no Items", async () => {
    const response = await server.app.request(
      "/api/notes/notes",
      json("POST", { id: newId(), kind: "text", body: "Plain" }, creator),
    )
    const textNote = noteRow.parse(await response.json())
    const refused = await addItem({ noteId: textNote.id, text: "Milk" })
    expect(refused.status).toBe(400)
    expect(await refused.json()).toMatchObject({ error: { code: "validation_failed" } })
  })

  test("a retried add answers with the stored Item, unchanged", async () => {
    const note = await checklist()
    const first = await added(note.id, "Milk")
    const retry = await addItem({ id: first.item.id, noteId: note.id, text: "Changed" })
    expect(retry.status).toBe(201)
    expect(itemWrite.parse(await retry.json()).item).toEqual(first.item)
    expect(texts((await itemsOf(note.id)).unchecked)).toEqual(["Milk"])
  })

  test("reusing an Item's id under another Checklist is 404 and changes neither", async () => {
    const first = await checklist("First")
    const second = await checklist("Second")
    const { item, noteEditedAt } = await added(first.id, "Milk")
    const reused = await addItem({ id: item.id, noteId: second.id, text: "Milk" })
    expect(reused.status).toBe(404)
    expect((await itemsOf(second.id)).unchecked).toEqual([])
    expect((await itemsOf(first.id)).unchecked).toEqual([item])
    expect(await listedNote(first.id)).toMatchObject({ editedAt: noteEditedAt })
    expect(await listedNote(second.id)).toMatchObject({ editedAt: second.editedAt })
  })

  test("to a Note that is gone is 404", async () => {
    expect((await addItem({ noteId: newId(), text: "Milk" })).status).toBe(404)
  })
})

describe("editing Items", () => {
  test("text is written on its own, leaving the tick alone", async () => {
    const note = await checklist()
    const { item } = await added(note.id, "Milk")
    await patched(item.id, { checked: true })
    const { item: edited } = await patched(item.id, { text: "Oat milk" })
    expect(edited).toMatchObject({ text: "Oat milk", checked: true })
  })

  test("an empty change or an unknown field is refused", async () => {
    const note = await checklist()
    const { item } = await added(note.id, "Milk")
    expect((await patchItem(item.id, {})).status).toBe(400)
    expect((await patchItem(item.id, { checkedAt: "2020-01-01T00:00:00.000Z" })).status).toBe(400)
    expect((await patchItem(item.id, { noteId: newId() })).status).toBe(400)
  })

  test("an unknown Item is 404", async () => {
    expect((await patchItem(newId(), { text: "Nothing" })).status).toBe(404)
    expect((await removeItem(newId())).status).toBe(404)
  })
})

describe("ticking", () => {
  test("stamps the server's time, and checked Items order by it, most recent first", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    const eggs = await added(note.id, "Eggs")
    const bread = await added(note.id, "Bread")
    const before = Date.now()
    const { item: tickedEggs } = await patched(eggs.item.id, { checked: true })
    await patched(milk.item.id, { checked: true })
    expect(tickedEggs.checked).toBe(true)
    expect(Date.parse(tickedEggs.checkedAt ?? "")).toBeGreaterThanOrEqual(before - 5_000)
    const { unchecked, checked } = await itemsOf(note.id)
    expect(texts(unchecked)).toEqual(["Bread"])
    expect(texts(checked)).toEqual(["Milk", "Eggs"])
    expect(bread.item.checkedAt).toBeNull()
  })

  test("ticking an Item already checked keeps its first tick time", async () => {
    const note = await checklist()
    const { item } = await added(note.id, "Milk")
    const first = await patched(item.id, { checked: true })
    const again = await patched(item.id, { checked: true })
    expect(again.item.checkedAt).toBe(first.item.checkedAt)
  })

  test("unticking clears the tick time and returns the Item to the bottom of the unchecked", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    await added(note.id, "Eggs")
    await added(note.id, "Bread")
    await patched(milk.item.id, { checked: true })
    const { item: unticked } = await patched(milk.item.id, { checked: false })
    expect(unticked).toMatchObject({ checked: false, checkedAt: null })
    expect(texts((await itemsOf(note.id)).unchecked)).toEqual(["Eggs", "Bread", "Milk"])
  })

  test("unticking an Item that is not checked leaves it where it is", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    await added(note.id, "Eggs")
    await patched(milk.item.id, { checked: false })
    expect(texts((await itemsOf(note.id)).unchecked)).toEqual(["Milk", "Eggs"])
  })
})

describe("deleting Items", () => {
  test("removes only that Item", async () => {
    const note = await checklist()
    const milk = await added(note.id, "Milk")
    await added(note.id, "Eggs")
    const response = await removeItem(milk.item.id)
    expect(response.status).toBe(200)
    expect(itemWrite.parse(await response.json()).item).toEqual(milk.item)
    expect(texts((await itemsOf(note.id)).unchecked)).toEqual(["Eggs"])
    expect((await removeItem(milk.item.id)).status).toBe(404)
    expect((await patchItem(milk.item.id, { text: "Back?" })).status).toBe(404)
  })
})

describe("edited at", () => {
  test("every Item write moves the Checklist's edited at forward and reports it", async () => {
    const note = await checklist()
    const writes = [await added(note.id, "Milk")]
    const itemId = writes[0]!.item.id
    writes.push(await patched(itemId, { text: "Oat milk" }))
    writes.push(await patched(itemId, { checked: true }))
    writes.push(await patched(itemId, { checked: false }))
    const response = await removeItem(itemId)
    writes.push(itemWrite.parse(await response.json()))

    let previous = Date.parse(note.editedAt)
    for (const write of writes) {
      expect(Date.parse(write.noteEditedAt)).toBeGreaterThan(previous)
      previous = Date.parse(write.noteEditedAt)
    }
    expect(await listedNote(note.id)).toMatchObject({ editedAt: writes.at(-1)!.noteEditedAt })
  })

  test("a write that changes nothing leaves it alone", async () => {
    const note = await checklist()
    const { item } = await added(note.id, "Milk")
    const ticked = await patched(item.id, { checked: true })
    const again = await patched(item.id, { checked: true })
    const sameText = await patched(item.id, { text: "Milk", checked: true })
    expect(again.noteEditedAt).toBe(ticked.noteEditedAt)
    expect(sameText.noteEditedAt).toBe(ticked.noteEditedAt)
    expect(again.item).toEqual(ticked.item)
    expect(await listedNote(note.id)).toMatchObject({ editedAt: ticked.noteEditedAt })
  })

  test("a refused Item write leaves it alone", async () => {
    const note = await checklist()
    const { item, noteEditedAt } = await added(note.id, "Milk")
    expect((await patchItem(item.id, { text: "Two\nlines" })).status).toBe(400)
    expect(await listedNote(note.id)).toMatchObject({ editedAt: noteEditedAt })
  })
})

describe("Items are seen only through their Checklist", () => {
  test("an Account without App access to Notes is refused every Item route", async () => {
    const note = await checklist()
    const { item } = await added(note.id, "Milk")
    const refused = [
      await server.app.request("/api/notes/items", { headers: noAccess }),
      await addItem({ noteId: note.id, text: "Nope" }, noAccess),
      await patchItem(item.id, { checked: true }, noAccess),
      await removeItem(item.id, noAccess),
    ]
    expect(refused.map((response) => response.status)).toEqual([403, 403, 403, 403])
  })

  for (const [who, as] of [
    ["another Account", () => someoneElse],
    ["the Admin", () => admin],
  ] as const) {
    test(`${who} cannot list, add, tick, edit or delete them, and gets 404`, async () => {
      const note = await checklist("Private")
      const { item } = await added(note.id, "Secret")
      expect((await items(as())).map((row) => row.id)).not.toContain(item.id)

      const writes = [
        await addItem({ noteId: note.id, text: "Mine now" }, as()),
        await patchItem(item.id, { checked: true }, as()),
        await patchItem(item.id, { text: "Mine now" }, as()),
        await removeItem(item.id, as()),
        // Reusing a hidden Item's id answers 404 too, so its existence never leaks.
        await addItem({ id: item.id, noteId: note.id, text: "Mine now" }, as()),
      ]
      expect(writes.map((response) => response.status)).toEqual([404, 404, 404, 404, 404])
      expect(await writes[0]!.json()).toMatchObject({ error: { code: "not_found" } })

      const { unchecked } = await itemsOf(note.id)
      expect(unchecked).toEqual([item])
    })
  }

  test("a write by someone who can't see the Checklist leaves its edited at alone", async () => {
    const note = await checklist()
    const { item, noteEditedAt } = await added(note.id, "Milk")
    await patchItem(item.id, { checked: true }, someoneElse)
    await removeItem(item.id, someoneElse)
    expect(await listedNote(note.id)).toMatchObject({ editedAt: noteEditedAt })
  })
})

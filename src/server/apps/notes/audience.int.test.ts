import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import {
  itemRows,
  itemWrite,
  notePeople,
  noteRow,
  noteRows,
  type NoteRow,
} from "#shared/notes/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

type Signed = { headers: Headers; id: string; name: string }

let server: TestServer
let creator: Signed
let member: Signed
let other: Signed
let admin: Signed

async function account(options: Parameters<TestServer["signedInAccount"]>[0]): Promise<Signed> {
  const { headers, user } = await server.signedInAccount(options)
  return { headers, id: user.id, name: user.name }
}

beforeAll(async () => {
  server = await createTestServer()
  creator = await account({ apps: ["notes"] })
  member = await account({ apps: ["notes"] })
  other = await account({ apps: ["notes"] })
  admin = await account({ role: "admin" })
})

afterAll(async () => {
  await server.close()
})

async function created(as: Signed = creator, body: Record<string, unknown> = {}) {
  const response = await server.app.request(
    "/api/notes/notes",
    json("POST", { id: newId(), kind: "text", title: "Shared", body: "Milk", ...body }, as.headers),
  )
  expect(response.status).toBe(201)
  return noteRow.parse(await response.json())
}

function share(noteId: string, accountIds: string[], as: Signed = creator) {
  return server.app.request(
    `/api/notes/notes/${noteId}/audience`,
    json("PUT", { accountIds }, as.headers),
  )
}

async function shared(noteId: string, accountIds: string[]) {
  const response = await share(noteId, accountIds)
  expect(response.status).toBe(200)
  return noteRow.parse(await response.json())
}

function patch(noteId: string, body: unknown, as: Signed) {
  return server.app.request(`/api/notes/notes/${noteId}`, json("PATCH", body, as.headers))
}

function remove(noteId: string, as: Signed) {
  return server.app.request(`/api/notes/notes/${noteId}`, {
    method: "DELETE",
    headers: as.headers,
  })
}

async function list(as: Signed): Promise<NoteRow[]> {
  const response = await server.app.request("/api/notes/notes", { headers: as.headers })
  expect(response.status).toBe(200)
  return noteRows.parse(await response.json()).rows
}

async function listed(noteId: string, as: Signed) {
  return (await list(as)).find((note) => note.id === noteId)
}

describe("sharing with an Audience", () => {
  test("a member sees and edits the Note, with the Creator's and each member's name", async () => {
    const note = await created()
    const sharedNote = await shared(note.id, [member.id])
    expect(sharedNote.audience).toEqual([{ id: member.id, name: member.name, hasAccess: true }])

    const seen = await listed(note.id, member)
    expect(seen).toMatchObject({
      title: "Shared",
      creator: { id: creator.id, name: creator.name },
      audience: [{ id: member.id, name: member.name }],
    })

    const edit = await patch(note.id, { body: "Milk\nEggs" }, member)
    expect(edit.status).toBe(200)
    expect(await listed(note.id, creator)).toMatchObject({ body: "Milk\nEggs" })
  })
})

describe("who sees a Note", () => {
  for (const [who, as] of [
    ["an Account not in the Audience", () => other],
    ["the Admin, not in the Audience", () => admin],
  ] as const) {
    test(`${who} gets 404 for every read and write`, async () => {
      const note = await created()
      await shared(note.id, [member.id])
      expect(await listed(note.id, as())).toBeUndefined()
      const answers = [
        await patch(note.id, { title: "Mine now" }, as()),
        await remove(note.id, as()),
        await share(note.id, [as().id], as()),
      ]
      expect(answers.map((response) => response.status)).toEqual([404, 404, 404])
      expect(await answers[0]!.json()).toMatchObject({ error: { code: "not_found" } })
      expect(await listed(note.id, creator)).toMatchObject({
        title: "Shared",
        audience: [{ id: member.id }],
      })
    })
  }

  test("the Admin in the Audience sees and edits it like anyone else", async () => {
    const note = await created()
    await shared(note.id, [admin.id])
    expect(await listed(note.id, admin)).toBeDefined()
    expect((await patch(note.id, { title: "By the Admin" }, admin)).status).toBe(200)
  })

  test("sharing with nobody keeps a Note private", async () => {
    const note = await created()
    expect(note.audience).toEqual([])
    expect((await shared(note.id, [])).audience).toEqual([])
    for (const as of [member, other, admin]) expect(await listed(note.id, as)).toBeUndefined()
  })

  test("a member removed by the Creator no longer sees it, and their writes are 404", async () => {
    const note = await created()
    await shared(note.id, [member.id, other.id])
    expect(await listed(note.id, member)).toBeDefined()
    expect((await shared(note.id, [other.id])).audience).toEqual([
      { id: other.id, name: other.name, hasAccess: true },
    ])
    expect(await listed(note.id, member)).toBeUndefined()
    expect((await patch(note.id, { body: "Still here?" }, member)).status).toBe(404)
    expect(await listed(note.id, other)).toBeDefined()
  })
})

describe("creator-only actions", () => {
  test("a member gets 403 deleting the Note or changing its Audience, and nothing changes", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    const deleting = await remove(note.id, member)
    expect(deleting.status).toBe(403)
    expect(await deleting.json()).toMatchObject({ error: { code: "forbidden_creator" } })
    expect((await share(note.id, [member.id, other.id], member)).status).toBe(403)
    expect((await share(note.id, [], member)).status).toBe(403)
    expect(await listed(note.id, creator)).toMatchObject({ audience: [{ id: member.id }] })
  })

  test("the Creator deletes a shared Note for everyone", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    expect((await remove(note.id, creator)).status).toBe(200)
    expect(await listed(note.id, member)).toBeUndefined()
    expect((await patch(note.id, { title: "Gone?" }, member)).status).toBe(404)
  })

  test("changing the Audience doesn't change edited at", async () => {
    const note = await created()
    const once = await shared(note.id, [member.id, other.id])
    const twice = await shared(note.id, [other.id])
    expect(once.editedAt).toBe(note.editedAt)
    expect(twice.editedAt).toBe(note.editedAt)
  })
})

async function people(as: Signed) {
  const response = await server.app.request("/api/notes/people", { headers: as.headers })
  expect(response.status).toBe(200)
  return notePeople.parse(await response.json()).rows
}

describe("the people a Creator can pick", () => {
  test("are the Accounts holding App access to Notes, the Admin included, never the caller", async () => {
    const noAccess = await account({ apps: ["finances"] })
    const ids = (await people(creator)).map((person) => person.id)
    expect(ids).toEqual(expect.arrayContaining([member.id, other.id, admin.id]))
    expect(ids).not.toContain(creator.id)
    expect(ids).not.toContain(noAccess.id)
    expect((await people(member)).find((person) => person.id === creator.id)).toEqual({
      id: creator.id,
      name: creator.name,
    })
    expect((await people(admin)).map((person) => person.id)).not.toContain(admin.id)
  })

  test("leave out a Removed Account, who can't be added", async () => {
    const removed = await account({ apps: ["notes"] })
    const response = await server.app.request(
      `/api/admin/accounts/${removed.id}/remove`,
      json("POST", {}, admin.headers),
    )
    expect(response.status).toBe(200)
    expect((await people(creator)).map((person) => person.id)).not.toContain(removed.id)
    expect((await share((await created()).id, [removed.id])).status).toBe(400)
  })

  test("are refused to an Account without App access to Notes", async () => {
    const noAccess = await account({ apps: ["finances"] })
    const response = await server.app.request("/api/notes/people", { headers: noAccess.headers })
    expect(response.status).toBe(403)
  })

  test("bound who can be added: anyone else is refused and the Audience is unchanged", async () => {
    const noAccess = await account({ apps: ["finances"] })
    const note = await created()
    await shared(note.id, [member.id])
    for (const ids of [[member.id, noAccess.id], [creator.id], ["no-such-account"]]) {
      const response = await share(note.id, ids)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: "validation_failed" } })
    }
    expect(await listed(note.id, creator)).toMatchObject({ audience: [{ id: member.id }] })
  })
})

function addItem(noteId: string, text: string, as: Signed) {
  return server.app.request(
    "/api/notes/items",
    json("POST", { id: newId(), noteId, text }, as.headers),
  )
}

function patchItem(itemId: string, body: unknown, as: Signed) {
  return server.app.request(`/api/notes/items/${itemId}`, json("PATCH", body, as.headers))
}

function removeItem(itemId: string, as: Signed) {
  return server.app.request(`/api/notes/items/${itemId}`, {
    method: "DELETE",
    headers: as.headers,
  })
}

async function items(as: Signed) {
  const response = await server.app.request("/api/notes/items", { headers: as.headers })
  expect(response.status).toBe(200)
  return itemRows.parse(await response.json()).rows
}

/** A Checklist its Creator has shared with the member. */
async function checklist() {
  const note = await created(creator, { kind: "checklist", title: "Groceries", body: undefined })
  await shared(note.id, [member.id])
  return note
}

describe("a shared Checklist's Items", () => {
  test("a member reads, adds, edits, ticks and deletes them", async () => {
    const note = await checklist()
    const byCreator = await addItem(note.id, "Milk", creator)
    expect(byCreator.status).toBe(201)
    const milk = itemWrite.parse(await byCreator.json()).item
    expect((await items(member)).find((item) => item.id === milk.id)).toMatchObject({
      text: "Milk",
    })

    const byMember = await addItem(note.id, "Eggs", member)
    expect(byMember.status).toBe(201)
    const eggs = itemWrite.parse(await byMember.json()).item

    expect((await patchItem(milk.id, { text: "Oat milk" }, member)).status).toBe(200)
    const tick = await patchItem(milk.id, { checked: true }, member)
    expect(tick.status).toBe(200)
    expect(itemWrite.parse(await tick.json()).item).toMatchObject({
      text: "Oat milk",
      checked: true,
    })
    expect((await removeItem(eggs.id, member)).status).toBe(200)

    const seen = (await items(creator)).filter((item) => item.noteId === note.id)
    expect(seen).toEqual([
      expect.objectContaining({ id: milk.id, text: "Oat milk", checked: true }),
    ])
  })

  for (const [who, as] of [
    ["an Account not in the Audience", () => other],
    ["the Admin, not in the Audience", () => admin],
  ] as const) {
    test(`${who} gets 404 for every Item read and write`, async () => {
      const note = await checklist()
      const response = await addItem(note.id, "Bread", creator)
      const bread = itemWrite.parse(await response.json()).item
      expect((await items(as())).map((item) => item.noteId)).not.toContain(note.id)
      const answers = [
        await addItem(note.id, "Sneaky", as()),
        await patchItem(bread.id, { text: "Mine" }, as()),
        await patchItem(bread.id, { checked: true }, as()),
        await removeItem(bread.id, as()),
      ]
      expect(answers.map((answer) => answer.status)).toEqual([404, 404, 404, 404])
      expect((await items(creator)).filter((item) => item.noteId === note.id)).toEqual([
        expect.objectContaining({ id: bread.id, text: "Bread", checked: false }),
      ])
    })
  }

  test("a member removed from the Audience loses its Items too", async () => {
    const note = await checklist()
    const response = await addItem(note.id, "Jam", creator)
    const jam = itemWrite.parse(await response.json()).item
    await shared(note.id, [])
    expect((await items(member)).map((item) => item.noteId)).not.toContain(note.id)
    expect((await patchItem(jam.id, { checked: true }, member)).status).toBe(404)
  })
})

function leave(noteId: string, as: Signed) {
  return server.app.request(`/api/notes/notes/${noteId}/leave`, json("POST", {}, as.headers))
}

describe("Leaving a Note", () => {
  test("a member Leaves: it leaves their view, and the Creator and the others keep it as it was", async () => {
    const note = await created()
    const before = await shared(note.id, [member.id, other.id])
    expect((await leave(note.id, member)).status).toBe(200)

    expect(await listed(note.id, member)).toBeUndefined()
    expect((await patch(note.id, { body: "Still here?" }, member)).status).toBe(404)
    const again = await leave(note.id, member)
    expect(again.status).toBe(404)
    expect(await again.json()).toMatchObject({ error: { code: "not_found" } })

    const remaining = { audience: [{ id: other.id, name: other.name }], editedAt: before.editedAt }
    expect(await listed(note.id, creator)).toMatchObject(remaining)
    expect(await listed(note.id, other)).toMatchObject(remaining)
  })

  test("Leaving doesn't change edited at", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    expect((await leave(note.id, member)).status).toBe(200)
    expect((await listed(note.id, creator))?.editedAt).toBe(note.editedAt)
  })

  test("only the Creator can add back a member who Left", async () => {
    const note = await created()
    await shared(note.id, [member.id, other.id])
    expect((await leave(note.id, member)).status).toBe(200)
    expect((await share(note.id, [other.id, member.id], member)).status).toBe(404)
    expect((await share(note.id, [other.id, member.id], other)).status).toBe(403)
    expect(await listed(note.id, member)).toBeUndefined()

    await shared(note.id, [other.id, member.id])
    expect(await listed(note.id, member)).toMatchObject({ title: "Shared" })
  })

  test("a member who Left and is added back finds the Note Unopened again", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    const opening = await server.app.request(
      `/api/notes/notes/${note.id}/open`,
      json("POST", {}, member.headers),
    )
    expect(opening.status).toBe(200)
    expect(await listed(note.id, member)).toMatchObject({ unopened: false })

    expect((await leave(note.id, member)).status).toBe(200)
    await shared(note.id, [member.id])
    expect(await listed(note.id, member)).toMatchObject({ unopened: true })
  })

  test("the Creator can't Leave their own Note, and nothing changes", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    const response = await leave(note.id, creator)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: "creator_cannot_leave" } })
    expect(await listed(note.id, creator)).toMatchObject({ audience: [{ id: member.id }] })
    expect(await listed(note.id, member)).toBeDefined()
  })

  for (const [who, as] of [
    ["an Account not in the Audience", () => other],
    ["the Admin, not in the Audience", () => admin],
  ] as const) {
    test(`${who} gets 404 Leaving, and nothing changes`, async () => {
      const note = await created()
      await shared(note.id, [member.id])
      const response = await leave(note.id, as())
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
      expect(await listed(note.id, creator)).toMatchObject({ audience: [{ id: member.id }] })
    })
  }

  test("a member can still Leave a Note whose Creator has lost App access", async () => {
    const author = await account({ apps: ["notes"] })
    const note = await created(author)
    expect((await share(note.id, [member.id], author)).status).toBe(200)
    const revoked = await server.app.request(
      `/api/admin/accounts/${author.id}/apps`,
      json("PUT", { apps: [] }, admin.headers),
    )
    expect(revoked.status).toBe(200)

    expect((await leave(note.id, member)).status).toBe(200)
    expect(await listed(note.id, member)).toBeUndefined()
  })
})

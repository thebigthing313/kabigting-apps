import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { noteRow, noteRows, type NoteRow } from "#shared/notes/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

let server: TestServer
let creator: { headers: Headers; id: string; name: string }
let someoneElse: Headers
let noAccess: Headers
let admin: { headers: Headers; id: string }

beforeAll(async () => {
  server = await createTestServer()
  const signedIn = await server.signedInAccount({ apps: ["notes"] })
  creator = { headers: signedIn.headers, id: signedIn.user.id, name: signedIn.user.name }
  someoneElse = (await server.signedInAccount({ apps: ["notes"] })).headers
  noAccess = (await server.signedInAccount({ apps: ["finances"] })).headers
  const signedInAdmin = await server.signedInAccount({ role: "admin" })
  admin = { headers: signedInAdmin.headers, id: signedInAdmin.user.id }
})

afterAll(async () => {
  await server.close()
})

function create(body: unknown, as = creator.headers) {
  return server.app.request("/api/notes/notes", json("POST", body, as))
}

async function created(body: Record<string, unknown> = {}, as = creator.headers) {
  const response = await create({ id: newId(), kind: "text", ...body }, as)
  expect(response.status).toBe(201)
  return noteRow.parse(await response.json())
}

function patch(noteId: string, body: unknown, as = creator.headers) {
  return server.app.request(`/api/notes/notes/${noteId}`, json("PATCH", body, as))
}

async function patched(noteId: string, body: unknown) {
  const response = await patch(noteId, body)
  expect(response.status).toBe(200)
  return noteRow.parse(await response.json())
}

function remove(noteId: string, as = creator.headers) {
  return server.app.request(`/api/notes/notes/${noteId}`, { method: "DELETE", headers: as })
}

async function list(as = creator.headers): Promise<NoteRow[]> {
  const response = await server.app.request("/api/notes/notes", { headers: as })
  expect(response.status).toBe(200)
  return noteRows.parse(await response.json()).rows
}

async function listed(noteId: string, as = creator.headers) {
  return (await list(as)).find((note) => note.id === noteId)
}

describe("App access", () => {
  test("an Account without App access to Notes is refused every route", async () => {
    const note = await created({ title: "Mine" })
    const refused = [
      await server.app.request("/api/notes/notes", { headers: noAccess }),
      await create({ id: newId(), kind: "text", title: "Nope" }, noAccess),
      await patch(note.id, { title: "Nope" }, noAccess),
      await remove(note.id, noAccess),
    ]
    expect(refused.map((response) => response.status)).toEqual([403, 403, 403, 403])
    expect(await refused[0]!.json()).toMatchObject({ error: { code: "forbidden_app" } })
  })

  test("access the Admin grants opens Notes, and revoking it refuses at once", async () => {
    const { user, headers } = await server.signedInAccount()
    const grant = (apps: string[]) =>
      server.app.request(
        `/api/admin/accounts/${user.id}/apps`,
        json("PUT", { apps }, admin.headers),
      )
    expect((await server.app.request("/api/notes/notes", { headers })).status).toBe(403)
    expect((await grant(["notes"])).status).toBe(200)
    expect((await server.app.request("/api/notes/notes", { headers })).status).toBe(200)
    expect((await grant([])).status).toBe(200)
    expect((await server.app.request("/api/notes/notes", { headers })).status).toBe(403)
  })

  test("the Admin opens Notes with no access row and makes Notes of their own", async () => {
    const note = await created({ title: "Admin's own" }, admin.headers)
    expect(note.creator.id).toBe(admin.id)
    expect((await list(admin.headers)).map((row) => row.id)).toContain(note.id)
  })
})

describe("create", () => {
  test("stores a Text note under the client's id with the caller as its Creator", async () => {
    const id = newId()
    const response = await create({ id, kind: "text", title: "Packing", body: "Socks\n\n  Hat" })
    expect(response.status).toBe(201)
    const note = noteRow.parse(await response.json())
    expect(note).toMatchObject({
      id,
      kind: "text",
      title: "Packing",
      body: "Socks\n\n  Hat",
      creator: { id: creator.id, name: creator.name },
    })
    expect(note.editedAt).toBe(note.createdAt)
    expect(await listed(id)).toEqual(note)
  })

  test("a Note made with only a title has an empty body; with only a body, no title", async () => {
    expect(await created({ title: "Just a title" })).toMatchObject({ body: "" })
    expect(await created({ body: "Just a body" })).toMatchObject({
      title: null,
      body: "Just a body",
    })
  })

  test("the body is kept exactly as typed", async () => {
    const body = "  indented\n\n\ttabbed  \nhttps://example.com *not bold*\n"
    expect((await created({ body })).body).toBe(body)
  })

  test("the Creator comes from the session, never the request", async () => {
    const response = await create({ id: newId(), kind: "text", creatorId: admin.id })
    expect(response.status).toBe(400)
  })

  test("a multi-line title is refused", async () => {
    expect((await create({ id: newId(), kind: "text", title: "One\nTwo" })).status).toBe(400)
  })

  test("only Text notes can be made for now", async () => {
    expect((await create({ id: newId(), kind: "checklist", title: "Later" })).status).toBe(400)
  })

  test("an id already in use is a conflict and changes nothing", async () => {
    const note = await created({ title: "Original" })
    const response = await create({ id: note.id, kind: "text", title: "Overwrite" }, someoneElse)
    expect(response.status).toBe(409)
    expect(await listed(note.id)).toMatchObject({ title: "Original" })
  })
})

describe("field updates", () => {
  test("the title and the body are each written on their own", async () => {
    const note = await created({ title: "Groceries", body: "Milk" })
    expect(await patched(note.id, { title: "Shopping" })).toMatchObject({
      title: "Shopping",
      body: "Milk",
    })
    expect(await patched(note.id, { body: "Milk\nEggs" })).toMatchObject({
      title: "Shopping",
      body: "Milk\nEggs",
    })
  })

  test("a saved Note that is emptied stays", async () => {
    const note = await created({ title: "Soon empty", body: "Gone" })
    await patched(note.id, { title: null })
    await patched(note.id, { body: "" })
    expect(await listed(note.id)).toMatchObject({ title: null, body: "" })
  })

  test("every content write moves edited at forward; created at stays", async () => {
    const note = await created({ title: "Timing" })
    const first = await patched(note.id, { body: "One" })
    const second = await patched(note.id, { title: "Timing 2" })
    expect(Date.parse(first.editedAt)).toBeGreaterThan(Date.parse(note.editedAt))
    expect(Date.parse(second.editedAt)).toBeGreaterThan(Date.parse(first.editedAt))
    expect(second.createdAt).toBe(note.createdAt)
  })

  test("an empty change, an unknown field or a kind change is refused", async () => {
    const note = await created({ title: "Fixed" })
    expect((await patch(note.id, {})).status).toBe(400)
    expect((await patch(note.id, { kind: "checklist" })).status).toBe(400)
    expect((await patch(note.id, { editedAt: "2020-01-01T00:00:00.000Z" })).status).toBe(400)
  })

  test("an unknown id is 404", async () => {
    expect((await patch(newId(), { title: "Nothing" })).status).toBe(404)
  })
})

describe("list", () => {
  test("holds only the caller's Notes, newest edit first once ordered", async () => {
    const { headers } = await server.signedInAccount({ apps: ["notes"] })
    const older = await created({ title: "Older" }, headers)
    const newer = await created({ title: "Newer" }, headers)
    const rows = await list(headers)
    expect(rows.map((row) => row.id).toSorted()).toEqual([older.id, newer.id].toSorted())
  })
})

describe("delete", () => {
  test("the Creator deletes a Note for good", async () => {
    const note = await created({ title: "Delete me" })
    const response = await remove(note.id)
    expect(response.status).toBe(200)
    expect(await listed(note.id)).toBeUndefined()
    expect((await patch(note.id, { title: "Back?" })).status).toBe(404)
    expect((await remove(note.id)).status).toBe(404)
  })
})

describe("a Note is seen only by its Creator", () => {
  for (const [who, as] of [
    ["another Account", () => someoneElse],
    ["the Admin", () => admin.headers],
  ] as const) {
    test(`${who} cannot list, edit or delete it, and gets 404`, async () => {
      const note = await created({ title: "Private", body: "Secret" })
      expect((await list(as())).map((row) => row.id)).not.toContain(note.id)
      const edit = await patch(note.id, { title: "Mine now" }, as())
      expect(edit.status).toBe(404)
      expect(await edit.json()).toMatchObject({ error: { code: "not_found" } })
      expect((await patch(note.id, { body: "Mine now" }, as())).status).toBe(404)
      expect((await remove(note.id, as())).status).toBe(404)
      expect(await listed(note.id)).toMatchObject({ title: "Private", body: "Secret" })
    })
  }
})

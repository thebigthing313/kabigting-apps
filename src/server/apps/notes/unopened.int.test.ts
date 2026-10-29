import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { noteRow, noteRows, type NoteRow } from "#shared/notes/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

type Signed = { headers: Headers; id: string }

let server: TestServer
let creator: Signed
let member: Signed
let other: Signed
let admin: Signed

async function account(options: Parameters<TestServer["signedInAccount"]>[0]): Promise<Signed> {
  const { headers, user } = await server.signedInAccount(options)
  return { headers, id: user.id }
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

async function created() {
  const response = await server.app.request(
    "/api/notes/notes",
    json("POST", { id: newId(), kind: "text", title: "Shared", body: "Milk" }, creator.headers),
  )
  expect(response.status).toBe(201)
  return noteRow.parse(await response.json())
}

async function shared(noteId: string, accountIds: string[]) {
  const response = await server.app.request(
    `/api/notes/notes/${noteId}/audience`,
    json("PUT", { accountIds }, creator.headers),
  )
  expect(response.status).toBe(200)
  return noteRow.parse(await response.json())
}

function open(noteId: string, as: Signed) {
  return server.app.request(`/api/notes/notes/${noteId}/open`, json("POST", {}, as.headers))
}

async function opened(noteId: string, as: Signed) {
  const response = await open(noteId, as)
  expect(response.status).toBe(200)
  return noteRow.parse(await response.json())
}

async function listed(noteId: string, as: Signed): Promise<NoteRow | undefined> {
  const response = await server.app.request("/api/notes/notes", { headers: as.headers })
  expect(response.status).toBe(200)
  return noteRows.parse(await response.json()).rows.find((note) => note.id === noteId)
}

async function setApps(as: Signed, apps: string[]) {
  const response = await server.app.request(
    `/api/admin/accounts/${as.id}/apps`,
    json("PUT", { apps }, admin.headers),
  )
  expect(response.status).toBe(200)
}

describe("an Unopened Note", () => {
  test("is Unopened for each member just added, and never for its Creator", async () => {
    const note = await created()
    expect(note.unopened).toBe(false)
    await shared(note.id, [member.id, other.id])
    expect(await listed(note.id, member)).toMatchObject({ unopened: true })
    expect(await listed(note.id, other)).toMatchObject({ unopened: true })
    expect(await listed(note.id, creator)).toMatchObject({ unopened: false })
  })

  test("opening it clears it for that member only", async () => {
    const note = await created()
    await shared(note.id, [member.id, other.id])
    expect(await opened(note.id, member)).toMatchObject({ unopened: false })
    expect(await listed(note.id, member)).toMatchObject({ unopened: false })
    expect(await listed(note.id, other)).toMatchObject({ unopened: true })
  })

  test("opening it again, or later edits, don't bring it back", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    await opened(note.id, member)
    await opened(note.id, member)
    const edit = await server.app.request(
      `/api/notes/notes/${note.id}`,
      json("PATCH", { body: "Milk\nEggs" }, creator.headers),
    )
    expect(edit.status).toBe(200)
    expect(await listed(note.id, member)).toMatchObject({ unopened: false })
  })

  test("opening their own Note is a no-op for the Creator", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    expect(await opened(note.id, creator)).toMatchObject({ unopened: false })
    expect(await listed(note.id, member)).toMatchObject({ unopened: true })
  })

  test("opening a Note the caller can't see is 404, the Admin included", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    for (const as of [other, admin]) {
      const response = await open(note.id, as)
      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
    }
    expect((await open(newId(), member)).status).toBe(404)
  })

  test("opening doesn't count as an edit", async () => {
    const note = await created()
    await shared(note.id, [member.id])
    expect((await opened(note.id, member)).editedAt).toBe(note.editedAt)
  })

  test("is Unopened again when a removed member is added back", async () => {
    const note = await created()
    await shared(note.id, [member.id, other.id])
    await opened(note.id, member)
    await opened(note.id, other)
    await shared(note.id, [other.id])
    await shared(note.id, [other.id, member.id])
    expect(await listed(note.id, member)).toMatchObject({ unopened: true })
    // Someone who stayed in the Audience throughout keeps their opened state.
    expect(await listed(note.id, other)).toMatchObject({ unopened: false })
  })

  test("losing and regaining App access doesn't reset it", async () => {
    const leaver = await account({ apps: ["notes"] })
    const seen = await created()
    const unseen = await created()
    await shared(seen.id, [leaver.id])
    await shared(unseen.id, [leaver.id])
    await opened(seen.id, leaver)

    await setApps(leaver, [])
    const refused = await server.app.request("/api/notes/notes", { headers: leaver.headers })
    expect(refused.status).toBe(403)
    await setApps(leaver, ["notes"])

    expect(await listed(seen.id, leaver)).toMatchObject({ unopened: false })
    expect(await listed(unseen.id, leaver)).toMatchObject({ unopened: true })
  })
})

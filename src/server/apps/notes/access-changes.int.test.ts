import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { newId } from "#shared/ids.ts"
import { noteRow, noteRows, type NoteRow } from "#shared/notes/schemas.ts"
import { createTestServer, json, type TestServer } from "#server/test/server.ts"

type Signed = { headers: Headers; id: string; name: string }

let server: TestServer
let admin: Signed

async function account(options: Parameters<TestServer["signedInAccount"]>[0]): Promise<Signed> {
  const { headers, user } = await server.signedInAccount(options)
  return { headers, id: user.id, name: user.name }
}

/** An Account holding App access to Notes. */
function withNotes() {
  return account({ apps: ["notes"] })
}

beforeAll(async () => {
  server = await createTestServer()
  admin = await account({ role: "admin" })
})

afterAll(async () => {
  await server.close()
})

async function created(as: Signed) {
  const response = await server.app.request(
    "/api/notes/notes",
    json("POST", { id: newId(), kind: "text", title: "Shared", body: "Milk" }, as.headers),
  )
  expect(response.status).toBe(201)
  return noteRow.parse(await response.json())
}

function share(noteId: string, accountIds: string[], as: Signed) {
  return server.app.request(
    `/api/notes/notes/${noteId}/audience`,
    json("PUT", { accountIds }, as.headers),
  )
}

async function shared(noteId: string, accountIds: string[], as: Signed) {
  const response = await share(noteId, accountIds, as)
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

function open(noteId: string, as: Signed) {
  return server.app.request(`/api/notes/notes/${noteId}/open`, json("POST", {}, as.headers))
}

function leave(noteId: string, as: Signed) {
  return server.app.request(`/api/notes/notes/${noteId}/leave`, json("POST", {}, as.headers))
}

function notesOf(as: Signed) {
  return server.app.request("/api/notes/notes", { headers: as.headers })
}

async function listed(noteId: string, as: Signed): Promise<NoteRow | undefined> {
  const response = await notesOf(as)
  expect(response.status).toBe(200)
  return noteRows.parse(await response.json()).rows.find((note) => note.id === noteId)
}

/** The Admin acts on an Account from the Accounts screen. */
async function byAdmin(path: string, init: RequestInit) {
  const response = await server.app.request(`/api/admin/accounts/${path}`, init)
  expect(response.status).toBe(200)
}

function setApps(as: Signed, apps: string[]) {
  return byAdmin(`${as.id}/apps`, json("PUT", { apps }, admin.headers))
}

function removeAccount(as: Signed) {
  return byAdmin(`${as.id}/remove`, json("POST", {}, admin.headers))
}

function restoreAccount(as: Signed) {
  return byAdmin(`${as.id}/restore`, json("POST", {}, admin.headers))
}

/** The Account signs in again, as a restored Account must. */
async function signedInAgain(as: Signed): Promise<Signed> {
  const { test: helpers } = await server.auth.$context
  return { ...as, headers: await helpers.getAuthHeaders({ userId: as.id }) }
}

describe("the Audience in the Notes list", () => {
  test("says which members hold App access to Notes", async () => {
    const creator = await withNotes()
    const kept = await withNotes()
    const revoked = await withNotes()
    const removed = await withNotes()
    const note = await created(creator)
    await shared(note.id, [kept.id, revoked.id, removed.id, admin.id], creator)

    await setApps(revoked, [])
    await removeAccount(removed)

    const audience = (await listed(note.id, creator))?.audience ?? []
    expect(audience).toHaveLength(4)
    expect(audience).toEqual(
      expect.arrayContaining([
        { id: kept.id, name: kept.name, hasAccess: true },
        { id: revoked.id, name: revoked.name, hasAccess: false },
        { id: removed.id, name: removed.name, hasAccess: false },
        { id: admin.id, name: admin.name, hasAccess: true },
      ]),
    )
    // Every member sees the same Audience as the Creator.
    expect((await listed(note.id, kept))?.audience).toEqual(audience)
  })
})

describe("a member whose access changes", () => {
  test("stops seeing the Note without App access, and gets it back when access returns", async () => {
    const creator = await withNotes()
    const member = await withNotes()
    const note = await created(creator)
    await shared(note.id, [member.id], creator)

    await setApps(member, [])
    const refused = [
      await notesOf(member),
      await open(note.id, member),
      await patch(note.id, { body: "Still here?" }, member),
    ]
    expect(refused.map((response) => response.status)).toEqual([403, 403, 403])
    expect(await refused[0]!.json()).toMatchObject({ error: { code: "forbidden_app" } })
    expect((await listed(note.id, creator))?.audience).toEqual([
      { id: member.id, name: member.name, hasAccess: false },
    ])

    await setApps(member, ["notes"])
    expect(await listed(note.id, member)).toMatchObject({ title: "Shared", body: "Milk" })
    expect((await patch(note.id, { body: "Milk\nEggs" }, member)).status).toBe(200)
    expect((await listed(note.id, creator))?.audience).toEqual([
      { id: member.id, name: member.name, hasAccess: true },
    ])
  })

  test("is signed out and refused as a Removed Account, and gets the Note back when restored", async () => {
    const creator = await withNotes()
    const member = await withNotes()
    const seen = await created(creator)
    const unseen = await created(creator)
    await shared(seen.id, [member.id], creator)
    await shared(unseen.id, [member.id], creator)
    expect((await open(seen.id, member)).status).toBe(200)

    await removeAccount(member)
    expect((await notesOf(member)).status).toBe(401)
    expect((await patch(seen.id, { body: "Still here?" }, member)).status).toBe(401)
    expect((await listed(seen.id, creator))?.audience).toEqual([
      { id: member.id, name: member.name, hasAccess: false },
    ])

    // A session the removal missed would still be refused at the App gate.
    const lingering = await signedInAgain(member)
    expect((await notesOf(lingering)).status).toBe(403)

    await restoreAccount(member)
    const restored = await signedInAgain(member)
    // Back as they left it: the Note they opened stays opened, the other is still Unopened.
    expect(await listed(seen.id, restored)).toMatchObject({ unopened: false })
    expect(await listed(unseen.id, restored)).toMatchObject({ unopened: true })
    expect((await listed(seen.id, creator))?.audience).toEqual([
      { id: member.id, name: member.name, hasAccess: true },
    ])
  })
})

describe("the Creator's Share sheet", () => {
  test("keeps members without access when others change, and can remove them", async () => {
    const creator = await withNotes()
    const revoked = await withNotes()
    const removed = await withNotes()
    const added = await withNotes()
    const note = await created(creator)
    await shared(note.id, [revoked.id, removed.id], creator)
    await setApps(revoked, [])
    await removeAccount(removed)

    const widened = await shared(note.id, [revoked.id, removed.id, added.id], creator)
    expect(widened.audience).toHaveLength(3)
    expect(widened.audience).toEqual(
      expect.arrayContaining([
        { id: revoked.id, name: revoked.name, hasAccess: false },
        { id: removed.id, name: removed.name, hasAccess: false },
        { id: added.id, name: added.name, hasAccess: true },
      ]),
    )

    const narrowed = await shared(note.id, [added.id], creator)
    expect(narrowed.audience).toEqual([{ id: added.id, name: added.name, hasAccess: true }])
  })

  test("never adds back a member without access once they are removed", async () => {
    const creator = await withNotes()
    const revoked = await withNotes()
    const removed = await withNotes()
    const note = await created(creator)
    await shared(note.id, [revoked.id, removed.id], creator)
    await setApps(revoked, [])
    await removeAccount(removed)
    await shared(note.id, [], creator)

    for (const member of [revoked, removed]) {
      const response = await share(note.id, [member.id], creator)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: "validation_failed", details: { accountIds: [member.id] } },
      })
    }
    expect((await listed(note.id, creator))?.audience).toEqual([])
  })
})

describe("a Note whose Creator loses access", () => {
  for (const [how, takeAway] of [
    ["loses App access to Notes", (as: Signed) => setApps(as, [])],
    ["becomes a Removed Account", removeAccount],
  ] as const) {
    test(`stays readable and editable by its Audience when the Creator ${how}`, async () => {
      const creator = await withNotes()
      const member = await withNotes()
      const note = await created(creator)
      await shared(note.id, [member.id], creator)

      await takeAway(creator)
      expect(await listed(note.id, member)).toMatchObject({
        creator: { id: creator.id, name: creator.name },
        audience: [{ id: member.id, hasAccess: true }],
      })
      expect((await open(note.id, member)).status).toBe(200)
      expect((await patch(note.id, { title: "Ours now" }, member)).status).toBe(200)
      expect(await listed(note.id, member)).toMatchObject({ title: "Ours now" })
    })
  }

  test("can't be deleted or have its Audience changed by anyone, the Admin included", async () => {
    const creator = await withNotes()
    const member = await withNotes()
    const other = await withNotes()
    const hidden = await created(creator)
    const withAdmin = await created(creator)
    await shared(hidden.id, [member.id], creator)
    await shared(withAdmin.id, [member.id, admin.id], creator)
    await setApps(creator, [])

    // The Creator is refused at the App gate.
    for (const response of [
      await remove(hidden.id, creator),
      await share(hidden.id, [], creator),
    ]) {
      expect(response.status).toBe(403)
      expect(await response.json()).toMatchObject({ error: { code: "forbidden_app" } })
    }
    // A member, the Admin among them, is not its Creator.
    for (const as of [member, admin]) {
      for (const response of [
        await remove(withAdmin.id, as),
        await share(withAdmin.id, [as.id], as),
        await share(withAdmin.id, [], as),
      ]) {
        expect(response.status).toBe(403)
        expect(await response.json()).toMatchObject({ error: { code: "forbidden_creator" } })
      }
    }
    // Anyone outside the Audience, the Admin included, can't see it at all.
    for (const as of [other, admin]) {
      for (const response of [await remove(hidden.id, as), await share(hidden.id, [as.id], as)]) {
        expect(response.status).toBe(404)
        expect(await response.json()).toMatchObject({ error: { code: "not_found" } })
      }
    }

    expect((await listed(hidden.id, member))?.audience.map((each) => each.id)).toEqual([member.id])
    const kept = (await listed(withAdmin.id, member))?.audience.map((each) => each.id)
    expect(kept?.toSorted()).toEqual([member.id, admin.id].toSorted())

    // Once the Creator is back, the Note is theirs to change again.
    await setApps(creator, ["notes"])
    expect((await shared(hidden.id, [], creator)).audience).toEqual([])
    expect((await remove(hidden.id, creator)).status).toBe(200)
  })

  test("can still be Left by a member while its Creator is a Removed Account", async () => {
    const creator = await withNotes()
    const leaver = await withNotes()
    const stayer = await withNotes()
    const note = await created(creator)
    await shared(note.id, [leaver.id, stayer.id], creator)
    await removeAccount(creator)

    const leaving = await leave(note.id, leaver)
    expect(leaving.status).toBe(200)
    expect(await listed(note.id, leaver)).toBeUndefined()
    // Leaving isn't a content change, and the Note stays for everyone else.
    expect(await listed(note.id, stayer)).toMatchObject({
      editedAt: note.editedAt,
      creator: { id: creator.id, name: creator.name },
      audience: [{ id: stayer.id, name: stayer.name, hasAccess: true }],
    })
  })

  test("can't be reached by the Admin acting as its Creator", async () => {
    const creator = await withNotes()
    const note = await created(creator)
    await setApps(creator, [])

    // However the path is spelled, impersonation never reaches Better Auth.
    for (const path of [
      "/api/auth/admin/impersonate-user",
      "/api/auth/%61dmin/impersonate-user",
      "/api/auth/admin/impersonate-user/",
    ]) {
      const impersonating = await server.app.request(
        path,
        json("POST", { userId: creator.id }, admin.headers),
      )
      expect(impersonating.status, path).toBe(404)
      expect(impersonating.headers.get("set-cookie"), path).toBeNull()
      // The Shell's own 404, not Better Auth's.
      expect(await impersonating.json(), path).toMatchObject({ error: { code: "not_found" } })
    }
    const resetting = await server.app.request(
      "/api/auth/admin/set-user-password",
      json(
        "POST",
        { userId: creator.id, newPassword: "a-password-the-admin-knows" },
        admin.headers,
      ),
    )
    expect(resetting.status).toBe(404)

    await setApps(creator, ["notes"])
    expect(await listed(note.id, creator)).toBeDefined()
  })

  test("can't be deleted or have its Audience changed while its Creator is removed", async () => {
    const creator = await withNotes()
    const member = await withNotes()
    const note = await created(creator)
    await shared(note.id, [member.id, admin.id], creator)
    await removeAccount(creator)

    // The Creator's session is gone; everyone else is not its Creator.
    expect((await remove(note.id, creator)).status).toBe(401)
    expect((await share(note.id, [], creator)).status).toBe(401)
    for (const as of [member, admin]) {
      expect((await remove(note.id, as)).status).toBe(403)
      expect((await share(note.id, [], as)).status).toBe(403)
    }
    expect((await listed(note.id, member))?.audience).toHaveLength(2)
  })
})

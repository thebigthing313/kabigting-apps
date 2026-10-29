// A Note's page open while someone else edits the same Note: the real page, hooks and
// collections against a fake server that keeps state the way the real one does. Someone else's
// change is made on the fake server, then a refetch (as on focus or reconnect) brings it in.
import "@/styles.css"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { cleanup, render } from "vitest-browser-react"
import { NotePage } from "@/apps/notes/note-page"
import { cleanupCollections } from "@/data/collection-factory"
import type { Item, Note } from "@/data/notes"
import { queryClient } from "@/data/query-client"
import { dismissToasts } from "@/test/toasts"
import { orderItems } from "@shared/notes/items"
import {
  clearChecked as clearRequest,
  updateItem as itemPatch,
  updateNote as notePatch,
} from "@shared/notes/schemas"

/** Comfortably past the ~1 s pause after which typing saves. */
const SAVED_WITHIN = { timeout: 2_500 }

const me = { id: "me", name: "Mara" }
const ana = { id: "ana", name: "Ana" }

const TEXT_NOTE = "0190f5d2-0000-7000-8000-000000000401"
const CHECKLIST = "0190f5d2-0000-7000-8000-000000000402"
const MILK = "0190f5d2-0000-7000-8000-000000000411"
const EGGS = "0190f5d2-0000-7000-8000-000000000412"
const BREAD = "0190f5d2-0000-7000-8000-000000000413"
const JAM = "0190f5d2-0000-7000-8000-000000000414"
const MY_NOTE = "0190f5d2-0000-7000-8000-000000000403"

const EDITED = "2026-10-01T09:00:00.000Z"
const SERVER_NOW = "2026-10-02T09:00:00.000Z"

function sharedNote(id: string, kind: Note["kind"], title: string, body: string | null): Note {
  return {
    id,
    kind,
    title,
    body,
    creator: ana,
    audience: [{ ...me, hasAccess: true }],
    unopened: false,
    createdAt: EDITED,
    editedAt: EDITED,
  }
}

function item(id: string, text: string, position: string, checked = false): Item {
  return {
    id,
    noteId: CHECKLIST,
    text,
    checked,
    checkedAt: checked ? EDITED : null,
    position,
  }
}

/** What the server holds. Someone else's edit changes it directly. */
let notes: Note[] = []
let items: Item[] = []
/** How the server answers typed text: stored, or unreached as on a dropped network. */
let typedText: "store" | "unreachable" = "store"
/** The discrete actions the server refuses, as when it fails. */
let refusing = new Set<"tick" | "move" | "delete item" | "clear" | "delete note">()
/** The saves of typed text and the Item writes sent, in order. */
let sent: { path: string; body: unknown }[] = []

const notFound = () =>
  Response.json({ error: { code: "not_found", message: "This isn't here" } }, { status: 404 })

const crash = () =>
  Response.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 })

function serveNote(path: string, method: string, body: unknown): Response {
  const [, , , , id, action] = path.split("/")
  const note = notes.find((each) => each.id === id)
  if (method === "GET" && id === undefined) return Response.json({ rows: notes })
  if (action === "open") return note ? Response.json(note) : notFound()
  if (action === "clear-checked") {
    if (refusing.has("clear")) return crash()
    if (!note) return notFound()
    const ids = new Set(clearRequest.parse(body).itemIds)
    const cleared = items.filter((each) => ids.has(each.id) && each.checked).map((each) => each.id)
    items = items.filter((each) => !cleared.includes(each.id))
    return Response.json({ cleared, kept: [], noteEditedAt: SERVER_NOW })
  }
  if (method === "DELETE") {
    if (refusing.has("delete note")) return crash()
    if (!note) return notFound()
    notes = notes.filter((each) => each.id !== id)
    return Response.json(note)
  }
  if (method === "PATCH") {
    sent.push({ path, body })
    if (typedText === "unreachable") throw new TypeError("Failed to fetch")
    if (!note) return notFound()
    const stored: Note = { ...note, ...notePatch.parse(body), editedAt: SERVER_NOW }
    notes = notes.map((each) => (each.id === id ? stored : each))
    return Response.json(stored)
  }
  return notFound()
}

function serveItem(path: string, method: string, body: unknown): Response {
  const [, , , , id] = path.split("/")
  const found = items.find((each) => each.id === id)
  if (method === "GET") return Response.json({ rows: items })
  if (method === "PATCH") {
    sent.push({ path, body })
    const patch = itemPatch.parse(body)
    if (patch.text !== undefined && typedText === "unreachable") {
      throw new TypeError("Failed to fetch")
    }
    if (patch.checked !== undefined && refusing.has("tick")) return crash()
    if (patch.position !== undefined && refusing.has("move")) return crash()
    if (!found) return notFound()
    const tick =
      patch.checked === true
        ? { checked: true, checkedAt: SERVER_NOW }
        : patch.checked === false
          ? { checked: false, checkedAt: null }
          : {}
    const stored: Item = { ...found, ...patch, ...tick }
    items = items.map((each) => (each.id === id ? stored : each))
    return Response.json({ item: stored, noteEditedAt: SERVER_NOW })
  }
  if (method === "DELETE") {
    sent.push({ path, body })
    if (refusing.has("delete item")) return crash()
    if (!found) return notFound()
    items = items.filter((each) => each.id !== id)
    return Response.json({ item: found, noteEditedAt: SERVER_NOW })
  }
  return notFound()
}

function serve(path: string, method: string, body: unknown): Response {
  const route = path.split("/")[3]
  if (route === "notes") return serveNote(path, method, body)
  if (route === "items") return serveItem(path, method, body)
  if (route === "people") return Response.json({ rows: [] })
  return notFound()
}

beforeEach(() => {
  notes = [
    sharedNote(TEXT_NOTE, "text", "Trip", "Socks"),
    sharedNote(CHECKLIST, "checklist", "Groceries", null),
    { ...sharedNote(MY_NOTE, "text", "Mine", "Private"), creator: me, audience: [] },
  ]
  items = [item(MILK, "Milk", "a"), item(EGGS, "Eggs", "b"), item(BREAD, "Bread", "c")]
  typedText = "store"
  refusing = new Set()
  sent = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = ((input instanceof Request ? input.method : init?.method) ?? "GET").toUpperCase()
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null
    return serve(url.pathname, method, body)
  })
})

afterEach(async () => {
  // Each test starts again from the server's answer, as after signing in again, with no toast
  // left over: Sonner keeps its toasts across renders.
  dismissToasts()
  await cleanup()
  await cleanupCollections()
  queryClient.clear()
  vi.unstubAllGlobals()
})

/** Someone else's edit on the server, then the refetch that focus or reconnecting would make. */
async function elsewhere(change: () => void) {
  change()
  await queryClient.refetchQueries({ queryKey: ["notes"] })
}

const editNote = (id: string, changes: Partial<Note>) => {
  notes = notes.map((each) => (each.id === id ? { ...each, ...changes } : each))
}

const editItem = (id: string, changes: Partial<Item>) => {
  items = items.map((each) => (each.id === id ? { ...each, ...changes } : each))
}

/** The Note's page as the signed-in member opens it, with the Shell's toasts. */
async function openNote(noteId: string) {
  const rootRoute = createRootRoute()
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_app",
    beforeLoad: () => ({ session: { user: me } }),
  })
  const homeRoute = createRoute({
    getParentRoute: () => appRoute,
    path: "/notes",
    component: () => <p>Notes home</p>,
  })
  const noteRoute = createRoute({
    getParentRoute: () => appRoute,
    path: "/notes/$noteId",
    component: function NoteRoute() {
      return <NotePage noteId={noteRoute.useParams().noteId} />
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([appRoute.addChildren([homeRoute, noteRoute])]),
    history: createMemoryHistory({ initialEntries: [`/notes/${noteId}`] }),
  })
  await router.load()
  const screen = await render(
    <>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
      <Toaster />
    </>,
  )
  await expect.element(screen.getByLabelText("Title")).toBeVisible()
  return screen
}

type Screen = Awaited<ReturnType<typeof openNote>>

/** The Item texts shown in one part of the Checklist, top to bottom. */
function shown(screen: Screen, name: "To do" | "Checked") {
  return screen
    .getByRole("list", { name })
    .getByRole("textbox", { name: "Item" })
    .elements()
    .map((input) => (input instanceof HTMLInputElement ? input.value : ""))
}

/** What the server holds for the Checklist, unchecked then checked, top to bottom. */
function serverItems() {
  const { unchecked, checked } = orderItems(items)
  return {
    unchecked: unchecked.map((each) => each.text),
    checked: checked.map((each) => each.text),
  }
}

describe("someone else's changes arrive on a refetch, quietly", () => {
  test("a Text note's title and body", async () => {
    const screen = await openNote(TEXT_NOTE)
    await elsewhere(() => editNote(TEXT_NOTE, { title: "Beach trip", body: "Socks\nSunscreen" }))
    await expect.element(screen.getByLabelText("Title")).toHaveValue("Beach trip")
    await expect.element(screen.getByLabelText("Note")).toHaveValue("Socks\nSunscreen")
    // No banner announces it, and nothing is sent back.
    await expect.element(screen.getByText(/changed/i)).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })
})

describe("a refetch never overwrites text typed here that has not saved yet", () => {
  test("a field still pausing keeps its typing, saves over theirs, and the other field updates", async () => {
    const screen = await openNote(TEXT_NOTE)
    const body = screen.getByLabelText("Note")
    await userEvent.fill(body, "Socks and shoes")
    await expect.element(body).toHaveFocus()
    await elsewhere(() => editNote(TEXT_NOTE, { title: "Beach trip", body: "Sandals" }))
    await expect.element(screen.getByLabelText("Title")).toHaveValue("Beach trip")
    await expect.element(body).toHaveValue("Socks and shoes")
    // Then it saves, and the last write wins.
    await vi.waitFor(() => expect(notes[0]?.body).toBe("Socks and shoes"), SAVED_WITHIN)
    expect(notes[0]?.title).toBe("Beach trip")
    expect(sent).toEqual([
      { path: `/api/notes/notes/${TEXT_NOTE}`, body: { body: "Socks and shoes" } },
    ])
  })

  test("a Not saved field keeps its text, and the other field updates", async () => {
    const screen = await openNote(TEXT_NOTE)
    typedText = "unreachable"
    const title = screen.getByLabelText("Title")
    await userEvent.type(title, " plans")
    await expect.element(screen.getByText("Not saved")).toBeVisible()
    await userEvent.click(screen.getByLabelText("Note"))
    await elsewhere(() => editNote(TEXT_NOTE, { title: "Beach trip", body: "Sandals" }))
    await expect.element(screen.getByLabelText("Note")).toHaveValue("Sandals")
    await expect.element(title).toHaveValue("Trip plans")
    await expect.element(screen.getByText("Not saved")).toBeVisible()
    // Its retry, once the network is back, saves it over theirs.
    typedText = "store"
    window.dispatchEvent(new Event("online"))
    await vi.waitFor(() => expect(notes[0]?.title).toBe("Trip plans"))
    await expect.element(screen.getByText("Not saved")).not.toBeInTheDocument()
  })

  test("an Item's text still pausing keeps its typing while the others update", async () => {
    const screen = await openNote(CHECKLIST)
    const [milk] = screen.getByRole("textbox", { name: "Item" }).all()
    await userEvent.type(milk!, " and cream")
    await elsewhere(() => {
      editItem(MILK, { text: "Oat milk" })
      editItem(EGGS, { text: "Free-range eggs" })
    })
    await vi.waitFor(() =>
      expect(shown(screen, "To do")).toEqual(["Milk and cream", "Free-range eggs", "Bread"]),
    )
    await vi.waitFor(() => expect(serverItems().unchecked[0]).toBe("Milk and cream"), SAVED_WITHIN)
  })
})

describe("someone else's changes to a Checklist arrive on a refetch", () => {
  test("Items added, deleted, ticked, reordered and edited", async () => {
    const screen = await openNote(CHECKLIST)
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread"]))
    await elsewhere(() => {
      items = items.filter((each) => each.id !== EGGS)
      items = [...items, item(JAM, "Jam", "d")]
      editItem(BREAD, { position: "0" })
      editItem(MILK, { text: "Oat milk", checked: true, checkedAt: SERVER_NOW })
    })
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Bread", "Jam"]))
    expect(shown(screen, "Checked")).toEqual(["Oat milk"])
    expect(sent).toEqual([])
  })

  test("Items someone else cleared go", async () => {
    items = [item(MILK, "Milk", "a", true), item(EGGS, "Eggs", "b")]
    const screen = await openNote(CHECKLIST)
    const clear = screen.getByRole("button", { name: "Clear checked" })
    await expect.element(clear).toBeVisible()
    await elsewhere(() => {
      items = items.filter((each) => !each.checked)
    })
    await expect.element(clear).not.toBeInTheDocument()
    expect(shown(screen, "To do")).toEqual(["Eggs"])
  })
})

describe("an Item that is gone", () => {
  test("deleted elsewhere while typed into stays until its save, which finds it gone and drops it", async () => {
    const screen = await openNote(CHECKLIST)
    const [milk] = screen.getByRole("textbox", { name: "Item" }).all()
    await userEvent.type(milk!, " and cream")
    await elsewhere(() => {
      items = items.filter((each) => each.id !== MILK)
    })
    // The typing stays while it is still to save...
    expect(shown(screen, "To do")).toEqual(["Milk and cream", "Eggs", "Bread"])
    // ...then its save finds the Item gone: it is dropped with a toast and never comes back.
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Eggs", "Bread"]))
    expect(sent).toEqual([{ path: `/api/notes/items/${MILK}`, body: { text: "Milk and cream" } }])
    await elsewhere(() => {})
    expect(serverItems().unchecked).toEqual(["Eggs", "Bread"])
    expect(shown(screen, "To do")).toEqual(["Eggs", "Bread"])
  })

  test("deleted elsewhere is dropped by the tick that finds it gone, with a toast", async () => {
    const screen = await openNote(CHECKLIST)
    items = items.filter((each) => each.id !== MILK)
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Eggs", "Bread"]))
    await expect.element(screen.getByRole("list", { name: "Checked" })).not.toBeInTheDocument()
  })

  test("a delete the server refuses brings the Item back, with a toast", async () => {
    const screen = await openNote(CHECKLIST)
    refusing.add("delete item")
    await screen.getByRole("button", { name: "Delete item" }).first().click()
    await expect.element(screen.getByText("Deleting failed")).toBeVisible()
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread"]))
  })
})

describe("a Note that is gone", () => {
  test("deleted by its Creator while open leaves, and typing still to save brings nothing back", async () => {
    const screen = await openNote(TEXT_NOTE)
    await userEvent.fill(screen.getByLabelText("Note"), "Socks and shoes")
    await elsewhere(() => {
      notes = notes.filter((each) => each.id !== TEXT_NOTE)
    })
    await expect.element(screen.getByText("This note isn't available")).toBeVisible()
    // The typing is sent as the editor goes, finds the Note gone and says so.
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
    expect(sent).toEqual([
      { path: `/api/notes/notes/${TEXT_NOTE}`, body: { body: "Socks and shoes" } },
    ])
    await elsewhere(() => {})
    expect(notes.map((each) => each.id)).toEqual([CHECKLIST, MY_NOTE])
    await expect.element(screen.getByText("This note isn't available")).toBeVisible()
  })

  test("no longer shared while open leaves, with its Items", async () => {
    const screen = await openNote(CHECKLIST)
    await elsewhere(() => {
      notes = notes.filter((each) => each.id !== CHECKLIST)
      items = []
    })
    await expect.element(screen.getByText("This note isn't available")).toBeVisible()
    await expect.element(screen.getByRole("textbox", { name: "Item" })).not.toBeInTheDocument()
  })
})

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("a discrete action the server refuses is undone, with a toast", () => {
  test("a tick", async () => {
    const screen = await openNote(CHECKLIST)
    refusing.add("tick")
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
    await expect.element(screen.getByRole("checkbox", { name: "Milk" })).not.toBeChecked()
    expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread"])
  })

  test("a move", async () => {
    const screen = await openNote(CHECKLIST)
    refusing.add("move")
    const handle = screen.getByRole("button", { name: "Reorder Milk" }).element()
    if (handle instanceof HTMLElement) handle.focus()
    await userEvent.keyboard(" ")
    await pause(50)
    await userEvent.keyboard("{ArrowDown}")
    await pause(50)
    await userEvent.keyboard(" ")
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread"]))
  })

  test("Clear checked", async () => {
    items = [item(MILK, "Milk", "a", true), item(EGGS, "Eggs", "b")]
    const screen = await openNote(CHECKLIST)
    refusing.add("clear")
    await screen.getByRole("button", { name: "Clear checked" }).click()
    await expect.element(screen.getByText("Clearing failed")).toBeVisible()
    await vi.waitFor(() => expect(shown(screen, "Checked")).toEqual(["Milk"]))
  })

  test("deleting the Note", async () => {
    const screen = await openNote(MY_NOTE)
    refusing.add("delete note")
    await screen.getByRole("button", { name: "More" }).click()
    await screen.getByRole("menuitem", { name: "Delete note" }).click()
    await screen.getByRole("button", { name: "Delete" }).click()
    await expect.element(screen.getByText("Deleting failed")).toBeVisible()
    expect(notes.map((each) => each.id)).toContain(MY_NOTE)
  })
})

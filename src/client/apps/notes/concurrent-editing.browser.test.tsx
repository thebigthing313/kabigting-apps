// A Note's page open while someone else edits the same Note: the real page, hooks and
// collections against a fake server that keeps state the way the real one does. Someone else's
// change is made on the fake server, then a refetch (as on focus or reconnect) brings it in.
//
// Nothing here waits on the clock: the ~1 s typing pause runs on fake timers and is run out by
// hand, and the fake server holds loads and writes back until the test lets them land.
import "@/styles.css"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { notifyManager, QueryClientProvider } from "@tanstack/react-query"
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
  createItem as itemPost,
  updateItem as itemPatch,
  updateNote as notePatch,
} from "@shared/notes/schemas"

const me = { id: "me", name: "Mara" }
const ana = { id: "ana", name: "Ana" }

const TEXT_NOTE = "0190f5d2-0000-7000-8000-000000000401"
const CHECKLIST = "0190f5d2-0000-7000-8000-000000000402"
const MY_NOTE = "0190f5d2-0000-7000-8000-000000000403"
const MILK = "0190f5d2-0000-7000-8000-000000000411"
const EGGS = "0190f5d2-0000-7000-8000-000000000412"
const BREAD = "0190f5d2-0000-7000-8000-000000000413"
const JAM = "0190f5d2-0000-7000-8000-000000000414"

const EDITED = "2026-10-01T09:00:00.000Z"
const SERVER_NOW = "2026-10-02T09:00:00.000Z"

const ITEM_GONE = "Someone else deleted this item, so what you typed in it wasn't saved."
const NOTE_GONE = "It was deleted or is no longer shared with you, so what you typed wasn't saved."

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
/** How the server answers typed text: stored, refused, or unreached as on a dropped network. */
let typedText: "store" | "refuse" | "unreachable" = "store"
/** The discrete actions the server refuses, as when it fails. */
let refusing = new Set<"tick" | "move" | "add" | "delete item" | "clear" | "delete note">()
/** The saves of typed text and the Item writes sent, in order. */
let sent: { path: string; body: unknown }[] = []
/** While set, loads wait here: each answers what the server held when it was asked. */
let heldLoads: (() => void)[] | null = null
/** While set, writes wait here, and take effect only when let through. */
let heldWrites: (() => void)[] | null = null

const notFound = () =>
  Response.json({ error: { code: "not_found", message: "This isn't here" } }, { status: 404 })

const crash = () =>
  Response.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 })

const tooLong = () =>
  Response.json(
    { error: { code: "validation_failed", message: "Keep it shorter" } },
    { status: 400 },
  )

function load(rows: unknown[]): Response | Promise<Response> {
  const answer = Response.json({ rows })
  const held = heldLoads
  if (!held) return answer
  return new Promise((resolve) => held.push(() => resolve(answer)))
}

function write(perform: () => Response): Response | Promise<Response> {
  const held = heldWrites
  if (!held) return perform()
  return new Promise((resolve) => held.push(() => resolve(perform())))
}

function serveNote(path: string, method: string, body: unknown) {
  const [, , , , id, action] = path.split("/")
  const note = () => notes.find((each) => each.id === id)
  if (method === "GET" && id === undefined) return load(notes)
  if (action === "open") return Response.json(note() ?? null)
  if (action === "clear-checked") {
    if (refusing.has("clear")) return crash()
    if (!note()) return notFound()
    const ids = new Set(clearRequest.parse(body).itemIds)
    const cleared = items.filter((each) => ids.has(each.id) && each.checked).map((each) => each.id)
    items = items.filter((each) => !cleared.includes(each.id))
    return Response.json({ cleared, kept: [], noteEditedAt: SERVER_NOW })
  }
  if (method === "DELETE") {
    if (refusing.has("delete note")) return crash()
    const found = note()
    if (!found) return notFound()
    notes = notes.filter((each) => each.id !== id)
    return Response.json(found)
  }
  if (method === "PATCH") {
    sent.push({ path, body })
    if (typedText === "unreachable") throw new TypeError("Failed to fetch")
    if (typedText === "refuse") return tooLong()
    return write(() => {
      const found = note()
      if (!found) return notFound()
      const stored: Note = { ...found, ...notePatch.parse(body), editedAt: SERVER_NOW }
      notes = notes.map((each) => (each.id === id ? stored : each))
      return Response.json(stored)
    })
  }
  return notFound()
}

function serveItem(path: string, method: string, body: unknown) {
  const [, , , , id] = path.split("/")
  const found = () => items.find((each) => each.id === id)
  if (method === "GET") return load(items)
  if (method === "POST") {
    sent.push({ path, body })
    if (refusing.has("add")) return crash()
    const { id: added, noteId, text } = itemPost.parse(body)
    return write(() => {
      const unchecked = items.filter((each) => !each.checked).map((each) => each.position)
      const position = `${unchecked.toSorted().at(-1) ?? ""}m`
      const stored: Item = { id: added, noteId, text, checked: false, checkedAt: null, position }
      items = [...items, stored]
      return Response.json({ item: stored, noteEditedAt: SERVER_NOW }, { status: 201 })
    })
  }
  if (method === "PATCH") {
    sent.push({ path, body })
    const patch = itemPatch.parse(body)
    if (patch.text !== undefined && typedText === "unreachable") {
      throw new TypeError("Failed to fetch")
    }
    if (patch.text !== undefined && typedText === "refuse") return tooLong()
    if (patch.checked !== undefined && refusing.has("tick")) return crash()
    if (patch.position !== undefined && refusing.has("move")) return crash()
    return write(() => {
      const stored = found()
      if (!stored) return notFound()
      const tick =
        patch.checked === true
          ? { checked: true, checkedAt: SERVER_NOW }
          : patch.checked === false
            ? { checked: false, checkedAt: null }
            : {}
      const changed: Item = { ...stored, ...patch, ...tick }
      items = items.map((each) => (each.id === id ? changed : each))
      return Response.json({ item: changed, noteEditedAt: SERVER_NOW })
    })
  }
  if (method === "DELETE") {
    sent.push({ path, body })
    if (refusing.has("delete item")) return crash()
    const stored = found()
    if (!stored) return notFound()
    items = items.filter((each) => each.id !== id)
    return Response.json({ item: stored, noteEditedAt: SERVER_NOW })
  }
  return notFound()
}

function serve(path: string, method: string, body: unknown) {
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
  heldLoads = null
  heldWrites = null
  // The typing pause runs on fake timers; queries notify at once rather than on a timer.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  notifyManager.setScheduler(queueMicrotask)
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = ((input instanceof Request ? input.method : init?.method) ?? "GET").toUpperCase()
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null
    return serve(url.pathname, method, body)
  })
})

afterEach(async () => {
  // Each test starts again from the server's answer, as after signing in again, with no toast
  // left over.
  dismissToasts()
  await cleanup()
  await cleanupCollections()
  queryClient.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Lets the ~1 s typing pause run out, so typed text saves. */
async function pauseRunsOut() {
  await vi.advanceTimersByTimeAsync(1_000)
}

/** Waits for `check` to pass, running the timers due now (a toast showing, say) between tries. */
async function until(check: () => void) {
  await vi.waitFor(async () => {
    await vi.advanceTimersByTimeAsync(0)
    check()
  })
}

/** Waits for a toast saying `text`. */
async function toastShows(screen: Screen, text: string) {
  await until(() => expect(screen.getByText(text).query()).not.toBeNull())
}

/** Moves focus off every field, as tapping elsewhere does. */
function blur() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

/** The refetch that focus or reconnecting makes. */
async function refetch() {
  await queryClient.refetchQueries({ queryKey: ["notes"] })
}

/** Someone else's edit on the server, then the refetch that brings it in. */
async function elsewhere(change: () => void) {
  change()
  await refetch()
}

/**
 * Starts a refetch whose answers are held back: they carry what the server holds now, and land
 * when the returned function is called, as a slow load answering after a later save.
 */
async function slowRefetch() {
  const held: (() => void)[] = []
  heldLoads = held
  const refetching = refetch()
  await vi.waitFor(() => expect(held).toHaveLength(2))
  heldLoads = null
  return async () => {
    for (const release of held) release()
    await refetching
  }
}

/** Holds back every write from now until the returned function lets them through. */
function holdWrites() {
  const held: (() => void)[] = []
  heldWrites = held
  return async (count: number) => {
    await vi.waitFor(() => expect(held).toHaveLength(count))
    heldWrites = null
    for (const release of held) release()
  }
}

const editNote = (id: string, changes: Partial<Note>) => {
  notes = notes.map((each) => (each.id === id ? { ...each, ...changes } : each))
}

const editItem = (id: string, changes: Partial<Item>) => {
  items = items.map((each) => (each.id === id ? { ...each, ...changes } : each))
}

/** The Note's page as the signed-in Account opens it, with the Shell's toasts. */
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

/** Types into the Item showing `text`, its caret at the end. */
async function typeIntoItem(screen: Screen, text: string, typed: string) {
  const input = screen
    .getByRole("textbox", { name: "Item" })
    .elements()
    .find((each) => each instanceof HTMLInputElement && each.value === text)
  if (!(input instanceof HTMLInputElement)) throw new Error(`No Item ${text}`)
  await userEvent.fill(input, `${text}${typed}`)
}

/** Waits for the browser to draw `count` frames. */
async function nextFrames(count: number) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

/** Moves an unchecked Item one place down with its handle's keyboard controls. */
async function moveDown(screen: Screen, name: string) {
  const handle = screen.getByRole("button", { name: `Reorder ${name}` })
  const element = handle.element()
  if (element instanceof HTMLElement) element.focus()
  await userEvent.keyboard(" ")
  await expect.element(handle).toHaveAttribute("aria-pressed", "true")
  // The drag measures the Items on the frames and timers after it starts; a key before then
  // moves nothing.
  await vi.advanceTimersByTimeAsync(50)
  await nextFrames(2)
  await userEvent.keyboard("{ArrowDown}")
  await until(() =>
    expect(
      [...document.querySelectorAll("[role=status]")].map((each) => each.textContent).join("|"),
    ).toContain(`${name} moved to position 2`),
  )
  await userEvent.keyboard(" ")
  await expect.element(handle).not.toHaveAttribute("aria-pressed")
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

describe("a refetch never overwrites text typed here that has not saved yet", () => {
  test("a field still pausing keeps its typing and saves over theirs; the other updates", async () => {
    const screen = await openNote(TEXT_NOTE)
    const body = screen.getByLabelText("Note")
    await userEvent.fill(body, "Socks and shoes")
    blur()
    await elsewhere(() => editNote(TEXT_NOTE, { title: "Beach trip", body: "Sandals" }))
    await expect.element(screen.getByLabelText("Title")).toHaveValue("Beach trip")
    await expect.element(body).toHaveValue("Socks and shoes")
    // Then it saves, and the last write wins.
    await pauseRunsOut()
    await vi.waitFor(() => expect(notes[0]?.body).toBe("Socks and shoes"))
    expect(notes[0]?.title).toBe("Beach trip")
    expect(sent).toEqual([
      { path: `/api/notes/notes/${TEXT_NOTE}`, body: { body: "Socks and shoes" } },
    ])
  })

  test("a field whose save is on its way keeps its text; the other updates as it lands", async () => {
    const screen = await openNote(TEXT_NOTE)
    const letThrough = holdWrites()
    const title = screen.getByLabelText("Title")
    await userEvent.fill(title, "Trip plans")
    blur()
    await pauseRunsOut()
    await elsewhere(() => editNote(TEXT_NOTE, { title: "Beach trip", body: "Sandals" }))
    await expect.element(title).toHaveValue("Trip plans")
    await letThrough(1)
    await vi.waitFor(() => expect(notes[0]?.title).toBe("Trip plans"))
    await expect.element(screen.getByLabelText("Note")).toHaveValue("Sandals")
    await expect.element(title).toHaveValue("Trip plans")
  })

  test("a Not saved field keeps its text; the other updates", async () => {
    const screen = await openNote(TEXT_NOTE)
    typedText = "unreachable"
    const title = screen.getByLabelText("Title")
    await userEvent.fill(title, "Trip plans")
    blur()
    await pauseRunsOut()
    await expect.element(screen.getByText("Not saved")).toBeVisible()
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

  test("a focused field is left alone until it loses focus, then takes the latest", async () => {
    const screen = await openNote(TEXT_NOTE)
    const body = screen.getByLabelText("Note")
    await userEvent.click(body)
    await elsewhere(() => editNote(TEXT_NOTE, { title: "Beach trip", body: "Sandals" }))
    await expect.element(screen.getByLabelText("Title")).toHaveValue("Beach trip")
    await expect.element(body).toHaveValue("Socks")
    blur()
    await expect.element(body).toHaveValue("Sandals")
    expect(sent).toEqual([])
  })

  test("an Item's text still pausing keeps its typing while the others update", async () => {
    const screen = await openNote(CHECKLIST)
    await typeIntoItem(screen, "Milk", " and cream")
    blur()
    await elsewhere(() => {
      editItem(MILK, { text: "Oat milk" })
      editItem(EGGS, { text: "Free-range eggs" })
    })
    await vi.waitFor(() =>
      expect(shown(screen, "To do")).toEqual(["Milk and cream", "Free-range eggs", "Bread"]),
    )
    await pauseRunsOut()
    await vi.waitFor(() => expect(serverItems().unchecked[0]).toBe("Milk and cream"))
  })

  test("a refused save puts the field back as the server holds it, with a toast", async () => {
    const screen = await openNote(TEXT_NOTE)
    typedText = "refuse"
    const title = screen.getByLabelText("Title")
    await userEvent.fill(title, "Trip plans")
    blur()
    await pauseRunsOut()
    await toastShows(screen, "Saving failed")
    await expect.element(title).toHaveValue("Trip")
    await expect.element(screen.getByText("Not saved")).not.toBeInTheDocument()
  })
})

describe("a load that started before a save landed never undoes it", () => {
  test("typed text", async () => {
    const screen = await openNote(TEXT_NOTE)
    const land = await slowRefetch()
    const title = screen.getByLabelText("Title")
    await userEvent.fill(title, "Trip plans")
    blur()
    await pauseRunsOut()
    await vi.waitFor(() => expect(notes[0]?.title).toBe("Trip plans"))
    await land()
    await expect.element(title).toHaveValue("Trip plans")
    // Nothing more to save, and a later load agrees.
    await refetch()
    await expect.element(title).toHaveValue("Trip plans")
    expect(sent).toHaveLength(1)
  })

  test("a tick", async () => {
    const screen = await openNote(CHECKLIST)
    const land = await slowRefetch()
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await vi.waitFor(() => expect(serverItems().checked).toEqual(["Milk"]))
    await land()
    await expect.element(screen.getByRole("checkbox", { name: "Milk" })).toBeChecked()
    expect(shown(screen, "Checked")).toEqual(["Milk"])
  })

  test("a move", async () => {
    const screen = await openNote(CHECKLIST)
    const land = await slowRefetch()
    await moveDown(screen, "Milk")
    await vi.waitFor(() => expect(serverItems().unchecked).toEqual(["Eggs", "Milk", "Bread"]))
    await land()
    expect(shown(screen, "To do")).toEqual(["Eggs", "Milk", "Bread"])
  })

  test("an added Item", async () => {
    const screen = await openNote(CHECKLIST)
    const land = await slowRefetch()
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Jam{Enter}")
    await vi.waitFor(() => expect(serverItems().unchecked).toContain("Jam"))
    await land()
    expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread", "Jam"])
    await refetch()
    expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread", "Jam"])
  })

  test("text saved by the retry on reconnecting, beside the reconnect's own refetch", async () => {
    const screen = await openNote(TEXT_NOTE)
    typedText = "unreachable"
    const title = screen.getByLabelText("Title")
    await userEvent.fill(title, "Trip plans")
    blur()
    await pauseRunsOut()
    await expect.element(screen.getByText("Not saved")).toBeVisible()

    // The network comes back: the retry and the reconnect's refetch go out together, and the
    // refetch answers what the server held before the retry landed.
    typedText = "store"
    await queryClient.invalidateQueries({ queryKey: ["notes"], refetchType: "none" })
    const loads: (() => void)[] = []
    heldLoads = loads
    const letThrough = holdWrites()
    window.dispatchEvent(new Event("offline"))
    window.dispatchEvent(new Event("online"))
    await vi.waitFor(() => expect(loads).toHaveLength(2))
    heldLoads = null
    await letThrough(1)
    await vi.waitFor(() => expect(notes[0]?.title).toBe("Trip plans"))
    await expect.element(screen.getByText("Not saved")).not.toBeInTheDocument()
    for (const release of loads) release()
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0))
    await expect.element(title).toHaveValue("Trip plans")
  })
})

describe("an Item that is gone", () => {
  test("deleted elsewhere while typed into stays until its save, then goes, saying why", async () => {
    const screen = await openNote(CHECKLIST)
    await typeIntoItem(screen, "Milk", " and cream")
    blur()
    await elsewhere(() => {
      items = items.filter((each) => each.id !== MILK)
    })
    // The typing stays while it is still to save...
    expect(shown(screen, "To do")).toEqual(["Milk and cream", "Eggs", "Bread"])
    // ...then its save finds the Item gone: it goes, the toast says why, and it never comes back.
    await pauseRunsOut()
    await toastShows(screen, ITEM_GONE)
    expect(screen.getByText("Saving failed").query()).toBeNull()
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Eggs", "Bread"]))
    expect(sent).toEqual([{ path: `/api/notes/items/${MILK}`, body: { text: "Milk and cream" } }])
    await refetch()
    expect(serverItems().unchecked).toEqual(["Eggs", "Bread"])
    expect(shown(screen, "To do")).toEqual(["Eggs", "Bread"])
  })

  test("deleted elsewhere before any refetch goes as its save finds it gone, saying why", async () => {
    const screen = await openNote(CHECKLIST)
    await typeIntoItem(screen, "Milk", " and cream")
    blur()
    items = items.filter((each) => each.id !== MILK)
    await pauseRunsOut()
    await toastShows(screen, ITEM_GONE)
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Eggs", "Bread"]))
  })

  test("deleted elsewhere and not typed into goes quietly", async () => {
    const screen = await openNote(CHECKLIST)
    await elsewhere(() => {
      items = items.filter((each) => each.id !== MILK)
    })
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Eggs", "Bread"]))
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByText(ITEM_GONE).query()).toBeNull()
  })

  test("deleted elsewhere is dropped by the tick that finds it gone, with a toast", async () => {
    const screen = await openNote(CHECKLIST)
    items = items.filter((each) => each.id !== MILK)
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await toastShows(screen, "Saving failed")
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Eggs", "Bread"]))
    await expect.element(screen.getByRole("list", { name: "Checked" })).not.toBeInTheDocument()
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
    await toastShows(screen, NOTE_GONE)
    expect(sent).toEqual([
      { path: `/api/notes/notes/${TEXT_NOTE}`, body: { body: "Socks and shoes" } },
    ])
    await refetch()
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

describe("a discrete action the server refuses is undone, with a toast", () => {
  test("a tick", async () => {
    const screen = await openNote(CHECKLIST)
    refusing.add("tick")
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await toastShows(screen, "Saving failed")
    await expect.element(screen.getByRole("checkbox", { name: "Milk" })).not.toBeChecked()
    expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread"])
  })

  test("a move", async () => {
    const screen = await openNote(CHECKLIST)
    refusing.add("move")
    await moveDown(screen, "Milk")
    await toastShows(screen, "Saving failed")
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread"]))
  })

  test("an add", async () => {
    const screen = await openNote(CHECKLIST)
    refusing.add("add")
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Jam{Enter}")
    await toastShows(screen, "Saving failed")
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread"]))
  })

  test("deleting an Item", async () => {
    const screen = await openNote(CHECKLIST)
    refusing.add("delete item")
    await screen.getByRole("button", { name: "Delete item" }).first().click()
    await toastShows(screen, "Deleting failed")
    await vi.waitFor(() => expect(shown(screen, "To do")).toEqual(["Milk", "Eggs", "Bread"]))
  })

  test("Clear checked", async () => {
    items = [item(MILK, "Milk", "a", true), item(EGGS, "Eggs", "b")]
    const screen = await openNote(CHECKLIST)
    refusing.add("clear")
    await screen.getByRole("button", { name: "Clear checked" }).click()
    await toastShows(screen, "Clearing failed")
    await vi.waitFor(() => expect(shown(screen, "Checked")).toEqual(["Milk"]))
  })

  test("deleting the Note", async () => {
    const screen = await openNote(MY_NOTE)
    refusing.add("delete note")
    await screen.getByRole("button", { name: "More" }).click()
    await screen.getByRole("menuitem", { name: "Delete note" }).click()
    await screen.getByRole("button", { name: "Delete" }).click()
    await toastShows(screen, "Deleting failed")
    expect(notes.map((each) => each.id)).toContain(MY_NOTE)
  })
})

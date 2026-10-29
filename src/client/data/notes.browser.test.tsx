// Note and Item writes through the real hooks and collections, against a fake server that answers
// the Notes routes the way the real one does: how a save ends, how it is reported, and when it
// is sent to outlive the page.
import { Toaster } from "sonner"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import {
  type Item,
  type Note,
  updateItem,
  updateItemText,
  updateNote,
  useItems,
  useNote,
  useNotes,
} from "@/data/notes"
import { orderNotes } from "@shared/notes/notes"
import { updateNote as notePatch } from "@shared/notes/schemas"

const CHECKLIST = "0190f5d2-0000-7000-8000-000000000001"
const TEXT_NOTE = "0190f5d2-0000-7000-8000-000000000002"
const PACKING = "0190f5d2-0000-7000-8000-0000000000a1"
const MILK = "0190f5d2-0000-7000-8000-000000000101"
const creator = { id: "me", name: "Someone" }

const NOTES: Note[] = [
  {
    id: CHECKLIST,
    kind: "checklist",
    title: "Groceries",
    body: null,
    creator,
    createdAt: "2026-10-01T09:00:00.000Z",
    editedAt: "2026-10-01T09:00:00.000Z",
  },
  {
    id: TEXT_NOTE,
    kind: "text",
    title: "Wi-Fi",
    body: "Ask at the desk",
    creator,
    createdAt: "2026-10-02T09:00:00.000Z",
    editedAt: "2026-10-02T09:00:00.000Z",
  },
  {
    id: PACKING,
    kind: "text",
    title: "Packing",
    body: "Socks",
    creator,
    createdAt: "2026-09-01T09:00:00.000Z",
    editedAt: "2026-09-01T09:00:00.000Z",
  },
]

const ITEMS: Item[] = [
  { id: MILK, noteId: CHECKLIST, text: "Milk", checked: false, checkedAt: null, position: "i" },
]

/** The server's clock, which need not agree with this device's. */
const SERVER_TICK = "2026-10-03T09:00:00.000Z"

/** How the fake server answers a save of typed text. */
let saving: "store" | "unreachable" | "refuse" | "gateway" | "crash" = "store"
/** How long the fake server takes to answer a save of typed text. */
let delay = 0
/** The saves of typed text sent, in order. */
let sent: { body: unknown; keepalive: boolean }[] = []

async function saveTypedText(body: unknown, store: () => unknown, keepalive: boolean) {
  sent.push({ body, keepalive })
  if (saving === "unreachable") throw new TypeError("Failed to fetch")
  await new Promise((resolve) => setTimeout(resolve, delay))
  if (saving === "gateway") return new Response("Bad gateway", { status: 502 })
  if (saving === "crash") {
    return Response.json(
      { error: { code: "internal", message: "Something went wrong" } },
      { status: 500 },
    )
  }
  if (saving === "refuse") {
    return Response.json(
      { error: { code: "validation_failed", message: "This note is too long" } },
      { status: 400 },
    )
  }
  return Response.json(store())
}

async function serve(path: string, method: string, init: RequestInit | undefined) {
  const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null
  const keepalive = init?.keepalive === true
  if (path === "/api/notes/notes" && method === "GET") return Response.json({ rows: NOTES })
  if (path === "/api/notes/items" && method === "GET") return Response.json({ rows: ITEMS })
  if (path === `/api/notes/notes/${PACKING}` && method === "PATCH") {
    const patch = notePatch.parse(body)
    return saveTypedText(patch, () => ({ ...NOTES[2], ...patch }), keepalive)
  }
  if (path === `/api/notes/items/${MILK}` && method === "PATCH") {
    if (typeof body === "object" && body !== null && "text" in body) {
      return saveTypedText(
        body,
        () => ({ item: { ...ITEMS[0], text: body.text }, noteEditedAt: SERVER_TICK }),
        keepalive,
      )
    }
    return Response.json({
      item: { ...ITEMS[0], checked: true, checkedAt: SERVER_TICK },
      noteEditedAt: SERVER_TICK,
    })
  }
  return Response.json({ rows: [] })
}

beforeEach(() => {
  saving = "store"
  delay = 0
  sent = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = (input instanceof Request ? input.method : init?.method) ?? "GET"
    return serve(url.pathname, method.toUpperCase(), init)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** What the Notes list reads: every Note, newest edit first, beside every Item. */
function ListHarness() {
  const { data: notes } = useNotes()
  useItems()
  return (
    <ol>
      {orderNotes(notes).map((note) => (
        <li key={note.id}>{note.title}</li>
      ))}
    </ol>
  )
}

test("ticking an Item moves its Checklist to the top of the list, with the server's tick time", async () => {
  const screen = await render(<ListHarness />)
  const titles = () =>
    screen
      .getByRole("listitem")
      .elements()
      .map((row) => row.textContent)
  await vi.waitFor(() => expect(titles()).toEqual(["Wi-Fi", "Groceries", "Packing"]))

  const stored = await updateItem(MILK, { checked: true })
  expect(stored).toMatchObject({ checked: true, checkedAt: SERVER_TICK })
  await vi.waitFor(() => expect(titles()).toEqual(["Groceries", "Wi-Fi", "Packing"]))
})

function Loaded() {
  const { note } = useNote(PACKING)
  useItems()
  return <p>{note ? "Loaded" : "Loading"}</p>
}

async function renderNote() {
  const screen = await render(
    <>
      <Loaded />
      <Toaster />
    </>,
  )
  await expect.element(screen.getByText("Loaded")).toBeVisible()
  return screen
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("a save of typed text", () => {
  test("is stored", async () => {
    await renderNote()
    expect(await updateNote(PACKING, { title: "Trip" }, { keepalive: false })).toBe("saved")
    expect(sent).toEqual([{ body: { title: "Trip" }, keepalive: false }])
  })

  test("that can't reach the server ends unreached, with no toast", async () => {
    const screen = await renderNote()
    saving = "unreachable"
    expect(await updateNote(PACKING, { body: "Socks, shoes" }, { keepalive: false })).toBe(
      "unreached",
    )
    await pause(300)
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()
  })

  test("of an Item that can't reach the server ends unreached too, with no toast", async () => {
    const screen = await renderNote()
    saving = "unreachable"
    expect(await updateItemText(MILK, "Oat milk", { keepalive: false })).toBe("unreached")
    await pause(300)
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()
  })

  test("that the server refuses ends refused, with a toast", async () => {
    const screen = await renderNote()
    saving = "refuse"
    expect(await updateNote(PACKING, { body: "Socks, shoes" }, { keepalive: false })).toBe(
      "refused",
    )
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
  })

  test("that a gateway fails ends unreached, with no toast, as the network does", async () => {
    const screen = await renderNote()
    saving = "gateway"
    expect(await updateNote(PACKING, { body: "Socks, shoes" }, { keepalive: false })).toBe(
      "unreached",
    )
    await pause(300)
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()
  })

  test("that fails on the server ends refused, with a toast", async () => {
    const screen = await renderNote()
    saving = "crash"
    expect(await updateNote(PACKING, { body: "Socks, shoes" }, { keepalive: false })).toBe(
      "refused",
    )
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
  })

  test("sent while leaving outlives the page", async () => {
    await renderNote()
    expect(await updateNote(PACKING, { body: "Socks and shoes" }, { keepalive: true })).toBe(
      "saved",
    )
    expect(await updateItemText(MILK, "Oat milk", { keepalive: true })).toBe("saved")
    expect(sent).toEqual([
      { body: { body: "Socks and shoes" }, keepalive: true },
      { body: { text: "Oat milk" }, keepalive: true },
    ])
  })

  test("too large for a request that outlives the page is still sent, as an ordinary one", async () => {
    await renderNote()
    const long = "x".repeat(80_000)
    expect(await updateNote(PACKING, { body: long }, { keepalive: true })).toBe("saved")
    expect(sent).toEqual([{ body: { body: long }, keepalive: false }])
  })

  test("sent together while leaving outlive the page only while their bodies fit, together", async () => {
    await renderNote()
    delay = 200
    const half = "x".repeat(40_000)
    const outcomes = await Promise.all([
      updateNote(PACKING, { title: "Trip" }, { keepalive: true }),
      updateNote(PACKING, { body: half }, { keepalive: true }),
      updateNote(PACKING, { body: `${half}y` }, { keepalive: true }),
    ])
    expect(outcomes).toEqual(["saved", "saved", "saved"])
    expect(sent.map((each) => each.keepalive)).toEqual([true, true, false])
  })
})

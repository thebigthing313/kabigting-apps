// Item writes through the real hooks and collections, against a fake server that answers the
// Notes routes the way the real one does.
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { type Item, type Note, updateItem, useItems, useNotes } from "@/data/notes"
import { orderNotes } from "@shared/notes/notes"

const CHECKLIST = "0190f5d2-0000-7000-8000-000000000001"
const TEXT_NOTE = "0190f5d2-0000-7000-8000-000000000002"
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
]

const ITEMS: Item[] = [
  { id: MILK, noteId: CHECKLIST, text: "Milk", checked: false, checkedAt: null, position: "i" },
]

/** The server's clock, which need not agree with this device's. */
const SERVER_TICK = "2026-10-03T09:00:00.000Z"

/** The bodies of the Item writes sent, in order. */
let itemPatches: unknown[] = []

function answer(path: string, method: string, body: Record<string, unknown>): unknown {
  if (path === "/api/notes/notes" && method === "GET") return { rows: NOTES }
  if (path === "/api/notes/items" && method === "GET") return { rows: ITEMS }
  if (path === `/api/notes/items/${MILK}` && method === "PATCH") {
    itemPatches.push(body)
    const tick = body.checked === true ? { checked: true, checkedAt: SERVER_TICK } : {}
    const move = typeof body.position === "string" ? { position: body.position } : {}
    return { item: { ...ITEMS[0], ...tick, ...move }, noteEditedAt: SERVER_TICK }
  }
  return { rows: [] }
}

beforeEach(() => {
  itemPatches = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = (input instanceof Request ? input.method : init?.method) ?? "GET"
    const text =
      input instanceof Request
        ? await input.clone().text()
        : typeof init?.body === "string"
          ? init.body
          : ""
    const body: Record<string, unknown> = text ? JSON.parse(text) : {}
    return Response.json(answer(url.pathname, method.toUpperCase(), body))
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
  await vi.waitFor(() => expect(titles()).toEqual(["Wi-Fi", "Groceries"]))

  const stored = await updateItem(MILK, { checked: true })
  expect(stored).toMatchObject({ checked: true, checkedAt: SERVER_TICK })
  await vi.waitFor(() => expect(titles()).toEqual(["Groceries", "Wi-Fi"]))
})

test("moving an Item sends only its new position and keeps it", async () => {
  const screen = await render(<ListHarness />)
  await vi.waitFor(() => expect(screen.getByRole("listitem").elements()).toHaveLength(2))

  const stored = await updateItem(MILK, { position: "a" })
  expect(stored).toMatchObject({ position: "a" })
  expect(itemPatches).toEqual([{ position: "a" }])
})

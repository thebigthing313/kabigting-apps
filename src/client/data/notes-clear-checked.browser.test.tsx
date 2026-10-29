// Clear checked through the real hooks and collections, against a fake server that answers the
// Notes routes the way the real one does.
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { cleanupCollections } from "@/data/collection-factory"
import { clearChecked, type Item, type Note, useItems, useNotes } from "@/data/notes"
import { queryClient } from "@/data/query-client"
import { orderItems } from "@shared/notes/items"
import { orderNotes } from "@shared/notes/notes"
import type { ClearedChecked } from "@shared/notes/schemas"

const CHECKLIST = "0190f5d2-0000-7000-8000-000000000001"
const TEXT_NOTE = "0190f5d2-0000-7000-8000-000000000002"
const MILK = "0190f5d2-0000-7000-8000-000000000101"
const JAM = "0190f5d2-0000-7000-8000-000000000102"
const BREAD = "0190f5d2-0000-7000-8000-000000000103"
const creator = { id: "me", name: "Someone" }

const NOTES: Note[] = [
  {
    id: CHECKLIST,
    kind: "checklist",
    title: "Groceries",
    body: null,
    creator,
    audience: [],
    createdAt: "2026-10-01T09:00:00.000Z",
    editedAt: "2026-10-01T09:00:00.000Z",
  },
  {
    id: TEXT_NOTE,
    kind: "text",
    title: "Wi-Fi",
    body: "Ask at the desk",
    creator,
    audience: [],
    createdAt: "2026-10-02T09:00:00.000Z",
    editedAt: "2026-10-02T09:00:00.000Z",
  },
]

const unchecked = (id: string, text: string, position: string): Item => ({
  id,
  noteId: CHECKLIST,
  text,
  checked: false,
  checkedAt: null,
  position,
})
const ITEMS: Item[] = [
  unchecked(MILK, "Milk", "c"),
  { ...unchecked(JAM, "Jam", "i"), checked: true, checkedAt: "2026-10-01T09:00:00.000Z" },
  { ...unchecked(BREAD, "Bread", "s"), checked: true, checkedAt: "2026-10-01T09:05:00.000Z" },
]

/** The server's clock, which need not agree with this device's. */
const SERVER_NOW = "2026-10-03T09:00:00.000Z"

/** How the fake server answers a clear; a test may change it. */
let clearAnswer: () => Response
const clearRequests: unknown[] = []

beforeEach(() => {
  clearRequests.length = 0
  clearAnswer = () =>
    Response.json({
      cleared: [JAM, BREAD],
      kept: [],
      noteEditedAt: SERVER_NOW,
    } satisfies ClearedChecked)
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const path = new URL(request.url, location.origin).pathname
    if (path === "/api/notes/notes" && request.method === "GET")
      return Response.json({ rows: NOTES })
    if (path === "/api/notes/items" && request.method === "GET")
      return Response.json({ rows: ITEMS })
    if (path === `/api/notes/notes/${CHECKLIST}/clear-checked` && request.method === "POST") {
      clearRequests.push(await request.json())
      return clearAnswer()
    }
    return Response.json({ rows: [] })
  })
})

afterEach(async () => {
  // Each test starts from the server's rows, not from what the last one left behind.
  await cleanup()
  await cleanupCollections()
  queryClient.clear()
  vi.unstubAllGlobals()
})

/** The Notes list beside one Checklist's Items, as the Notes pages read them. */
function Harness() {
  const { data: notes } = useNotes()
  const { data: items } = useItems()
  const ordered = orderItems(items.filter((item) => item.noteId === CHECKLIST))
  return (
    <>
      <ol aria-label="Notes">
        {orderNotes(notes).map((note) => (
          <li key={note.id}>{note.title}</li>
        ))}
      </ol>
      <ul aria-label="To do">
        {ordered.unchecked.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
      <ul aria-label="Checked">
        {ordered.checked.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </>
  )
}

async function renderHarness() {
  const screen = await render(<Harness />)
  const texts = (name: string) =>
    screen
      .getByRole("list", { name })
      .getByRole("listitem")
      .elements()
      .map((row) => row.textContent)
  await vi.waitFor(() => expect(texts("Checked")).toEqual(["Bread", "Jam"]))
  return { screen, texts }
}

test("clears the checked Items at once and moves the Checklist to the top of the list", async () => {
  const { texts } = await renderHarness()
  expect(texts("Notes")).toEqual(["Wi-Fi", "Groceries"])

  const done = clearChecked(CHECKLIST, [JAM, BREAD])
  await vi.waitFor(() => expect(texts("Checked")).toEqual([]))
  expect(await done).toEqual({ kept: [] })
  expect(clearRequests).toEqual([{ itemIds: [JAM, BREAD] }])
  expect(texts("Checked")).toEqual([])
  expect(texts("To do")).toEqual(["Milk"])
  await vi.waitFor(() => expect(texts("Notes")).toEqual(["Groceries", "Wi-Fi"]))
})

test("an Item someone unticked first comes back unchecked, as the server keeps it", async () => {
  const { texts } = await renderHarness()
  const keptJam = { ...unchecked(JAM, "Jam", "t") }
  clearAnswer = () =>
    Response.json({
      cleared: [BREAD],
      kept: [keptJam],
      noteEditedAt: SERVER_NOW,
    } satisfies ClearedChecked)

  expect(await clearChecked(CHECKLIST, [JAM, BREAD])).toEqual({ kept: [keptJam] })
  await vi.waitFor(() => expect(texts("To do")).toEqual(["Milk", "Jam"]))
  expect(texts("Checked")).toEqual([])
})

test("an Item the server had already lost stays gone, though this clear didn't delete it", async () => {
  const { texts } = await renderHarness()
  // Someone else deleted Jam first: the server clears only Bread and keeps nothing.
  clearAnswer = () =>
    Response.json({
      cleared: [BREAD],
      kept: [],
      noteEditedAt: SERVER_NOW,
    } satisfies ClearedChecked)

  expect(await clearChecked(CHECKLIST, [JAM, BREAD])).toEqual({ kept: [] })
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(texts("Checked")).toEqual([])
  expect(texts("To do")).toEqual(["Milk"])
})

test("a refused clear puts the checked Items back", async () => {
  const { texts } = await renderHarness()
  clearAnswer = () =>
    Response.json({ error: { code: "internal", message: "Try again" } }, { status: 500 })

  expect(await clearChecked(CHECKLIST, [JAM, BREAD])).toBeNull()
  await vi.waitFor(() => expect(texts("Checked")).toEqual(["Bread", "Jam"]))
  expect(texts("Notes")).toEqual(["Wi-Fi", "Groceries"])
})

test("a Checklist that is gone leaves the list, its Items with it", async () => {
  const { texts } = await renderHarness()
  clearAnswer = () =>
    Response.json({ error: { code: "not_found", message: "No such Note" } }, { status: 404 })

  expect(await clearChecked(CHECKLIST, [JAM, BREAD])).toBeNull()
  await vi.waitFor(() => expect(texts("Notes")).toEqual(["Wi-Fi"]))
  expect(texts("To do")).toEqual([])
  expect(texts("Checked")).toEqual([])
})

// Opening a Note through the real hooks and collections, against a fake server that answers the
// Notes routes the way the real one does.
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { cleanupCollections } from "@/data/collection-factory"
import { type Note, openNote, useNote, useNotes, useOpenOnVisit } from "@/data/notes"
import { queryClient } from "@/data/query-client"

const NOTE_ID = "0190f5d2-0000-7000-8000-000000000301"
const ben = { id: "ben", name: "Ben" }
const me = { id: "me", name: "Mara", hasAccess: true }

const NOTE: Note = {
  id: NOTE_ID,
  kind: "text",
  title: "Groceries",
  body: "Milk",
  creator: ben,
  audience: [me],
  unopened: true,
  createdAt: "2026-10-01T09:00:00.000Z",
  editedAt: "2026-10-01T09:00:00.000Z",
}

/** Settles the open request in flight, once there is one. */
let pendingOpen: ((response: Response) => void) | null = null
let opens = 0
/** The Note as the server lists it. */
let served: Note = NOTE

async function answerOpen(response: Response) {
  await vi.waitFor(() => expect(pendingOpen).not.toBeNull())
  pendingOpen?.(response)
}

beforeEach(() => {
  pendingOpen = null
  opens = 0
  served = NOTE
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = ((input instanceof Request ? input.method : init?.method) ?? "GET").toUpperCase()
    if (url.pathname === "/api/notes/notes" && method === "GET") {
      return Response.json({ rows: [served] })
    }
    if (url.pathname === `/api/notes/notes/${NOTE_ID}/open` && method === "POST") {
      opens += 1
      return new Promise<Response>((resolve) => {
        pendingOpen = resolve
      })
    }
    return Response.json({ rows: [] })
  })
})

afterEach(async () => {
  await cleanup()
  await cleanupCollections()
  queryClient.clear()
  vi.unstubAllGlobals()
})

/** Each Note as "title: unopened" while Unopened, or "title: opened". */
function Harness() {
  const { data: notes } = useNotes()
  return (
    <ul aria-label="Notes">
      {notes.map((note) => (
        <li key={note.id}>
          {note.title}: {note.unopened ? "unopened" : "opened"}
        </li>
      ))}
    </ul>
  )
}

async function renderNotes() {
  const screen = await render(<Harness />)
  const rows = () =>
    screen
      .getByRole("list", { name: "Notes" })
      .getByRole("listitem")
      .elements()
      .map((row) => row.textContent)
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries: unopened"]))
  return { rows }
}

test("opening a Note clears Unopened at once and asks the server once", async () => {
  const { rows } = await renderNotes()
  const opening = openNote(NOTE_ID)
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries: opened"]))
  await answerOpen(Response.json({ ...NOTE, unopened: false }))
  expect(await opening).toBe(true)
  expect(rows()).toEqual(["Groceries: opened"])
  expect(opens).toBe(1)
})

test("an open the server refuses leaves the Note Unopened", async () => {
  const { rows } = await renderNotes()
  const opening = openNote(NOTE_ID)
  await answerOpen(
    Response.json({ error: { code: "internal", message: "Try again" } }, { status: 500 }),
  )
  expect(await opening).toBe(false)
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries: unopened"]))
})

test("opening a Note that is gone drops it from the list", async () => {
  const { rows } = await renderNotes()
  const opening = openNote(NOTE_ID)
  await answerOpen(
    Response.json({ error: { code: "not_found", message: "No such Note" } }, { status: 404 }),
  )
  expect(await opening).toBe(false)
  await vi.waitFor(() => expect(rows()).toEqual([]))
})

/** A visit to the Note's page, showing whether it is Unopened. */
function Visit() {
  const { note } = useNote(NOTE_ID)
  useOpenOnVisit(NOTE_ID, note?.unopened ?? false)
  if (!note) return null
  return <p>{note.unopened ? "unopened" : "opened"}</p>
}

test("visiting an Unopened Note opens it once, even if the open fails", async () => {
  const screen = await render(<Visit />)
  await answerOpen(
    Response.json({ error: { code: "internal", message: "Try again" } }, { status: 500 }),
  )
  // The failed open brings Unopened back, but this visit doesn't ask again.
  await expect.element(screen.getByText("unopened")).toBeVisible()
  await screen.rerender(<Visit />)
  await expect.element(screen.getByText("unopened")).toBeVisible()
  expect(opens).toBe(1)
})

test("visiting a Note that isn't Unopened sends nothing", async () => {
  served = { ...NOTE, unopened: false }
  const screen = await render(<Visit />)
  await expect.element(screen.getByText("opened")).toBeVisible()
  await screen.rerender(<Visit />)
  expect(opens).toBe(0)
})

// Leaving through the real hooks and collections, against a fake server that answers the Notes
// routes the way the real one does.
import { Toaster } from "sonner"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { cleanupCollections } from "@/data/collection-factory"
import { leaveNote, type Note, useNotes } from "@/data/notes"
import { queryClient } from "@/data/query-client"

const NOTE_ID = "0190f5d2-0000-7000-8000-000000000301"
const ana = { id: "ana", name: "Ana" }
const me = { id: "me", name: "Mara" }

const NOTE: Note = {
  id: NOTE_ID,
  kind: "text",
  title: "Groceries",
  body: "Milk",
  creator: ana,
  audience: [me],
  createdAt: "2026-10-01T09:00:00.000Z",
  editedAt: "2026-10-01T09:00:00.000Z",
}

/** Settles the Leave request in flight, once there is one. */
let pendingLeave: ((response: Response) => void) | null = null

/** Answers the Leave when the test chooses, after the request has gone out. */
async function answerLeave(response: Response) {
  await vi.waitFor(() => expect(pendingLeave).not.toBeNull())
  pendingLeave?.(response)
}

beforeEach(() => {
  pendingLeave = null
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = ((input instanceof Request ? input.method : init?.method) ?? "GET").toUpperCase()
    if (url.pathname === "/api/notes/notes" && method === "GET") {
      return Response.json({ rows: [NOTE] })
    }
    if (url.pathname === `/api/notes/notes/${NOTE_ID}/leave` && method === "POST") {
      return new Promise<Response>((resolve) => {
        pendingLeave = resolve
      })
    }
    return Response.json({ rows: [] })
  })
})

afterEach(async () => {
  // Each test starts again from the server's answer, as after signing in again.
  await cleanup()
  await cleanupCollections()
  queryClient.clear()
  vi.unstubAllGlobals()
})

function refusal(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status })
}

/** Each Note's title, beside the Shell's toasts. */
function Harness() {
  const { data: notes } = useNotes()
  return (
    <>
      <ul aria-label="Notes">
        {notes.map((note) => (
          <li key={note.id}>{note.title}</li>
        ))}
      </ul>
      <Toaster />
    </>
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
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries"]))
  return { screen, rows }
}

test("a Leave takes the Note away at once, and it stays gone once the server agrees", async () => {
  const { rows } = await renderNotes()
  const leaving = leaveNote(NOTE_ID)
  await vi.waitFor(() => expect(rows()).toEqual([]))
  await answerLeave(Response.json({ id: NOTE_ID }))
  expect(await leaving).toBe(true)
  expect(rows()).toEqual([])
})

test("a refused Leave brings the Note back, with a toast", async () => {
  const { screen, rows } = await renderNotes()
  const leaving = leaveNote(NOTE_ID)
  await vi.waitFor(() => expect(rows()).toEqual([]))
  await answerLeave(refusal(500, "internal", "Something went wrong"))
  expect(await leaving).toBe(false)
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries"]))
  await expect.element(screen.getByText("Leaving failed")).toBeVisible()
})

test("a Leave of a Note that is already gone keeps it gone, with nothing to report", async () => {
  const { screen, rows } = await renderNotes()
  const leaving = leaveNote(NOTE_ID)
  await answerLeave(refusal(404, "not_found", "No such Note"))
  expect(await leaving).toBe(true)
  expect(rows()).toEqual([])
  await expect.element(screen.getByText("Leaving failed")).not.toBeInTheDocument()
})

// Sharing through the real hooks and collections, against a fake server that answers the Notes
// routes the way the real one does.
import { Toaster } from "sonner"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { cleanupCollections } from "@/data/collection-factory"
import { type Note, shareNote, useNotes } from "@/data/notes"
import { queryClient } from "@/data/query-client"

const NOTE_ID = "0190f5d2-0000-7000-8000-000000000201"
const me = { id: "me", name: "Mara" }
const ben = { id: "ben", name: "Ben", hasAccess: true }

const NOTE: Note = {
  id: NOTE_ID,
  kind: "text",
  title: "Groceries",
  body: "Milk",
  creator: me,
  audience: [],
  unopened: false,
  createdAt: "2026-10-01T09:00:00.000Z",
  editedAt: "2026-10-01T09:00:00.000Z",
}

/** Settles the Audience request in flight, once there is one. */
let pendingAudience: ((response: Response) => void) | null = null

/** Answers the replaced Audience when the test chooses, after the request has gone out. */
async function answerAudience(response: Response) {
  await vi.waitFor(() => expect(pendingAudience).not.toBeNull())
  pendingAudience?.(response)
}

beforeEach(() => {
  pendingAudience = null
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = ((input instanceof Request ? input.method : init?.method) ?? "GET").toUpperCase()
    if (url.pathname === "/api/notes/notes" && method === "GET") {
      return Response.json({ rows: [NOTE] })
    }
    if (url.pathname === `/api/notes/notes/${NOTE_ID}/audience` && method === "PUT") {
      return new Promise<Response>((resolve) => {
        pendingAudience = resolve
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

/** Each Note as "title: who it's shared with", beside the Shell's toasts. */
function Harness() {
  const { data: notes } = useNotes()
  return (
    <>
      <ul aria-label="Notes">
        {notes.map((note) => (
          <li key={note.id}>
            {note.title}: {note.audience.map((person) => person.name).join(", ")}
          </li>
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
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries: "]))
  return { screen, rows }
}

test("a Share shows at once and stays once the server stores it", async () => {
  const { rows } = await renderNotes()
  const sharing = shareNote(NOTE_ID, [ben])
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries: Ben"]))
  await answerAudience(Response.json({ ...NOTE, audience: [ben] }))
  expect(await sharing).toBe(true)
  expect(rows()).toEqual(["Groceries: Ben"])
})

test("a refused Share is undone, with a toast", async () => {
  const { screen, rows } = await renderNotes()
  const sharing = shareNote(NOTE_ID, [ben])
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries: Ben"]))
  await answerAudience(
    refusal(400, "validation_failed", "Only people with access to Notes can be added"),
  )
  expect(await sharing).toBe(false)
  await vi.waitFor(() => expect(rows()).toEqual(["Groceries: "]))
  await expect.element(screen.getByText("Sharing failed")).toBeVisible()
  await expect
    .element(screen.getByText("Only people with access to Notes can be added"))
    .toBeVisible()
})

test("a Share of a Note that is gone drops it from the list", async () => {
  const { screen, rows } = await renderNotes()
  const sharing = shareNote(NOTE_ID, [ben])
  await answerAudience(refusal(404, "not_found", "No such Note"))
  expect(await sharing).toBe(false)
  await vi.waitFor(() => expect(rows()).toEqual([]))
  await expect.element(screen.getByText("Sharing failed")).toBeVisible()
})

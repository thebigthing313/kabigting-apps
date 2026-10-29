// Typed-text saves through the real Notes collection, against a fake server: how a save ends, how
// it is reported, and when it is sent to outlive the page.
import { Toaster } from "sonner"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { updateNote, useNote } from "@/data/notes"
import { type NoteRow, updateNote as patch } from "@shared/notes/schemas"

const ID = "0190f5d2-0000-7000-8000-0000000000a1"

const STORED: NoteRow = {
  id: ID,
  kind: "text",
  title: "Packing",
  body: "Socks",
  creator: { id: "creator", name: "Creator" },
  createdAt: "2026-10-01T09:00:00.000Z",
  editedAt: "2026-10-01T09:00:00.000Z",
}

/** How the fake server answers the next save. */
let answer: "store" | "unreachable" | "refuse" | "gateway" | "crash" = "store"
/** How long the fake server takes to answer a save. */
let delay = 0
let sent: { body: unknown; keepalive: boolean }[] = []

beforeEach(() => {
  answer = "store"
  delay = 0
  sent = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const path = new URL(url, location.origin).pathname
    if (path === "/api/notes/notes" && (init?.method ?? "GET") === "GET") {
      return Response.json({ rows: [STORED] })
    }
    const body = patch.parse(typeof init?.body === "string" ? JSON.parse(init.body) : null)
    sent.push({ body, keepalive: init?.keepalive === true })
    if (answer === "unreachable") throw new TypeError("Failed to fetch")
    await new Promise((resolve) => setTimeout(resolve, delay))
    if (answer === "gateway") return new Response("Bad gateway", { status: 502 })
    if (answer === "crash") {
      return Response.json(
        { error: { code: "internal", message: "Something went wrong" } },
        { status: 500 },
      )
    }
    if (answer === "refuse") {
      return Response.json(
        { error: { code: "validation_failed", message: "This note is too long" } },
        { status: 400 },
      )
    }
    return Response.json({ ...STORED, ...body })
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function Loaded() {
  const { note } = useNote(ID)
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

describe("a save of typed text", () => {
  test("is stored", async () => {
    await renderNote()
    expect(await updateNote(ID, { title: "Trip" }, { keepalive: false })).toBe("saved")
    expect(sent).toEqual([{ body: { title: "Trip" }, keepalive: false }])
  })

  test("that can't reach the server ends unreached, with no toast", async () => {
    const screen = await renderNote()
    answer = "unreachable"
    expect(await updateNote(ID, { body: "Socks, shoes" }, { keepalive: false })).toBe("unreached")
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()
  })

  test("that the server refuses ends refused, with a toast", async () => {
    const screen = await renderNote()
    answer = "refuse"
    expect(await updateNote(ID, { body: "Socks, shoes" }, { keepalive: false })).toBe("refused")
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
  })

  test("that a gateway fails ends unreached, with no toast, as the network does", async () => {
    const screen = await renderNote()
    answer = "gateway"
    expect(await updateNote(ID, { body: "Socks, shoes" }, { keepalive: false })).toBe("unreached")
    await new Promise((resolve) => setTimeout(resolve, 300))
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()
  })

  test("that fails on the server ends refused, with a toast", async () => {
    const screen = await renderNote()
    answer = "crash"
    expect(await updateNote(ID, { body: "Socks, shoes" }, { keepalive: false })).toBe("refused")
    await expect.element(screen.getByText("Saving failed")).toBeVisible()
  })

  test("sent while leaving outlives the page", async () => {
    await renderNote()
    expect(await updateNote(ID, { body: "Socks and shoes" }, { keepalive: true })).toBe("saved")
    expect(sent).toEqual([{ body: { body: "Socks and shoes" }, keepalive: true }])
  })

  test("too large for a request that outlives the page is still sent, as an ordinary one", async () => {
    await renderNote()
    const long = "x".repeat(80_000)
    expect(await updateNote(ID, { body: long }, { keepalive: true })).toBe("saved")
    expect(sent).toEqual([{ body: { body: long }, keepalive: false }])
  })

  test("sent together while leaving outlive the page only while their bodies fit, together", async () => {
    await renderNote()
    delay = 200
    const half = "x".repeat(40_000)
    const outcomes = await Promise.all([
      updateNote(ID, { title: "Trip" }, { keepalive: true }),
      updateNote(ID, { body: half }, { keepalive: true }),
      updateNote(ID, { body: `${half}y` }, { keepalive: true }),
    ])
    expect(outcomes).toEqual(["saved", "saved", "saved"])
    expect(sent.map((each) => each.keepalive)).toEqual([true, true, false])
  })
})

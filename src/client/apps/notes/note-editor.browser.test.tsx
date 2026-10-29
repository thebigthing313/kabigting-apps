import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { NoteEditor, type NoteEditorProps } from "@/apps/notes/note-editor"
import type { NoteFields } from "@/data/notes"
import { instantAt } from "@shared/dates"

/** Comfortably past the ~1 s pause after which typing saves. */
const SAVED_WITHIN = { timeout: 2_500 }

const blank = { kind: "text", title: null, body: "", editedAt: null } as const

function callbacks() {
  return {
    onCreate: vi.fn<(fields: NoteFields) => Promise<boolean>>(() => Promise.resolve(true)),
    onUpdate: vi.fn<(changes: Partial<NoteFields>) => Promise<boolean>>(() =>
      Promise.resolve(true),
    ),
    onDelete: vi.fn<() => void>(),
    onBack: vi.fn<() => void>(),
  }
}

async function renderEditor(props: Partial<NoteEditorProps> = {}) {
  const spies = callbacks()
  const screen = await render(<NoteEditor note={blank} saved={false} {...spies} {...props} />)
  return { screen, ...spies }
}

describe("typing saves on its own", () => {
  test("a new Note is created about a second after typing pauses, with no Save button", async () => {
    const { screen, onCreate, onUpdate } = await renderEditor()
    await expect.element(screen.getByRole("button", { name: /save/i })).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText("Title"), "Groceries")
    expect(onCreate).not.toHaveBeenCalled()
    await vi.waitFor(
      () => expect(onCreate).toHaveBeenCalledWith({ title: "Groceries", body: "" }),
      SAVED_WITHIN,
    )
    expect(onCreate).toHaveBeenCalledTimes(1)

    // Once it exists, each field saves on its own.
    await userEvent.type(screen.getByLabelText("Note"), "Milk")
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ body: "Milk" }), SAVED_WITHIN)
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  test("a saved Note writes only the field that changed", async () => {
    const { screen, onUpdate, onCreate } = await renderEditor({
      note: { ...blank, title: "Packing", body: "Socks", editedAt: "2026-10-01T09:00:00.000Z" },
      saved: true,
    })
    await userEvent.fill(screen.getByLabelText("Title"), "Packing list")
    await vi.waitFor(
      () => expect(onUpdate).toHaveBeenCalledWith({ title: "Packing list" }),
      SAVED_WITHIN,
    )
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })

  test("leaving flushes typing that has not saved yet", async () => {
    const { screen, onCreate } = await renderEditor()
    await userEvent.type(screen.getByLabelText("Note"), "Call the plumber")
    await screen.unmount()
    expect(onCreate).toHaveBeenCalledWith({ title: "", body: "Call the plumber" })
  })
})

describe("an empty new Note", () => {
  test("left with nothing typed is never created", async () => {
    const { screen, onCreate, onBack } = await renderEditor()
    await screen.getByRole("button", { name: "Back to notes" }).click()
    expect(onBack).toHaveBeenCalled()
    await screen.unmount()
    expect(onCreate).not.toHaveBeenCalled()
  })

  test("typed into and cleared again is never created", async () => {
    const { screen, onCreate } = await renderEditor()
    await userEvent.type(screen.getByLabelText("Note"), "x")
    await userEvent.clear(screen.getByLabelText("Note"))
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    await screen.unmount()
    expect(onCreate).not.toHaveBeenCalled()
  })

  test("a saved Note that is emptied is saved empty, not discarded", async () => {
    const { screen, onUpdate } = await renderEditor({
      note: { ...blank, body: "Gone soon", editedAt: "2026-10-01T09:00:00.000Z" },
      saved: true,
    })
    await userEvent.clear(screen.getByLabelText("Note"))
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ body: "" }), SAVED_WITHIN)
  })
})

describe("the body", () => {
  test("keeps line breaks and spacing exactly, with no links or Markdown", async () => {
    const body = "# Not a heading\n\n  indented  **not bold**\nhttps://example.com"
    const { screen } = await renderEditor({
      note: { ...blank, body, editedAt: "2026-10-01T09:00:00.000Z" },
      saved: true,
    })
    await expect.element(screen.getByLabelText("Note")).toHaveValue(body)
    await expect.element(screen.getByRole("link")).not.toBeInTheDocument()
    await expect.element(screen.getByRole("heading")).not.toBeInTheDocument()
  })
})

describe("the foot and the ⋯ menu", () => {
  test("a saved Note shows when it was last edited", async () => {
    const editedAt = instantAt(Date.now() - 5 * 60_000)
    const { screen } = await renderEditor({ note: { ...blank, editedAt }, saved: true })
    await expect.element(screen.getByText("Edited 5 minutes ago")).toBeVisible()
  })

  test("the Creator deletes only after confirming", async () => {
    const { screen, onDelete, onUpdate } = await renderEditor({
      note: { ...blank, title: "Old", editedAt: "2026-10-01T09:00:00.000Z" },
      saved: true,
    })
    await screen.getByRole("button", { name: "More" }).click()
    await screen.getByRole("menuitem", { name: "Delete note" }).click()
    await expect.element(screen.getByText("Delete this note?")).toBeVisible()
    expect(onDelete).not.toHaveBeenCalled()
    await screen.getByRole("button", { name: "Cancel" }).click()
    expect(onDelete).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText("Title"), " news")
    await screen.getByRole("button", { name: "More" }).click()
    await screen.getByRole("menuitem", { name: "Delete note" }).click()
    await screen.getByRole("button", { name: "Delete" }).click()
    expect(onDelete).toHaveBeenCalledTimes(1)
    // Typing still waiting to save is dropped with the Note.
    await screen.unmount()
    expect(onUpdate).not.toHaveBeenCalled()
  })
})

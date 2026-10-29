import "@/styles.css"
import { afterEach, describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { NoteEditor, type NoteEditorProps } from "@/apps/notes/note-editor"
import type { NoteFields } from "@/data/notes"
import type { SaveOptions, SaveOutcome } from "@/data/settled"
import { instantAt } from "@shared/dates"

/** Comfortably past the ~1 s pause after which typing saves. */
const SAVED_WITHIN = { timeout: 2_500 }

const blank = { kind: "text", title: null, body: "", editedAt: null } as const

/** A save the test settles by hand, to act while it is in flight. */
function deferredSave() {
  const settle: { resolve?: (outcome: SaveOutcome) => void } = {}
  const promise = new Promise<SaveOutcome>((resolve) => {
    settle.resolve = resolve
  })
  return { promise, resolve: (outcome: SaveOutcome) => settle.resolve?.(outcome) }
}

/** How a save ordinarily goes out, and how it goes out when the page is being left. */
const NOW = { keepalive: false }
const LEAVING = { keepalive: true }

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function confirmDelete(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole("button", { name: "More" }).click()
  await screen.getByRole("menuitem", { name: "Delete note" }).click()
  await screen.getByRole("button", { name: "Delete" }).click()
}

function callbacks() {
  return {
    onCreate: vi.fn<(fields: NoteFields, options: SaveOptions) => Promise<SaveOutcome>>(() =>
      Promise.resolve("saved"),
    ),
    onUpdate: vi.fn<(changes: Partial<NoteFields>, options: SaveOptions) => Promise<SaveOutcome>>(
      () => Promise.resolve("saved"),
    ),
    onDelete: vi.fn<(onServer: Promise<boolean>) => void>(),
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
    await userEvent.fill(screen.getByLabelText("Title"), "Groceries")
    expect(onCreate).not.toHaveBeenCalled()
    await vi.waitFor(
      () => expect(onCreate).toHaveBeenCalledWith({ title: "Groceries", body: "" }, NOW),
      SAVED_WITHIN,
    )
    expect(onCreate).toHaveBeenCalledTimes(1)

    // Once it exists, each field saves on its own.
    await userEvent.fill(screen.getByLabelText("Note"), "Milk")
    await vi.waitFor(
      () => expect(onUpdate).toHaveBeenCalledWith({ body: "Milk" }, NOW),
      SAVED_WITHIN,
    )
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
      () => expect(onUpdate).toHaveBeenCalledWith({ title: "Packing list" }, NOW),
      SAVED_WITHIN,
    )
    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
  })

  test("leaving flushes typing that has not saved yet, sent to outlive the page", async () => {
    const { screen, onCreate } = await renderEditor()
    await userEvent.type(screen.getByLabelText("Note"), "Call the plumber")
    await screen.unmount()
    await vi.waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({ title: "", body: "Call the plumber" }, LEAVING),
    )
    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})

const packing = { ...blank, title: "Packing", body: "Socks", editedAt: "2026-10-01T09:00:00.000Z" }

/** Quicker than the ~1 s pause, so a save seen within it went out at once. */
const AT_ONCE = { timeout: 400 }

function hidePage() {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
  document.dispatchEvent(new Event("visibilitychange"))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("a save that can't reach the server", () => {
  test("keeps the typed text, marked Not saved, until the next keystroke saves it", async () => {
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    onUpdate.mockResolvedValueOnce("unreached")
    const title = screen.getByLabelText("Title")
    await userEvent.type(title, " list")
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1), SAVED_WITHIN)
    await expect.element(title).toHaveValue("Packing list")
    await expect.element(title).toHaveAccessibleDescription("Not saved")
    await expect.element(screen.getByLabelText("Note")).not.toHaveAccessibleDescription()

    await userEvent.type(title, "s")
    await vi.waitFor(
      () => expect(onUpdate).toHaveBeenLastCalledWith({ title: "Packing lists" }, NOW),
      SAVED_WITHIN,
    )
    await expect.element(title).not.toHaveAccessibleDescription()
    await expect.element(screen.getByText("Not saved")).not.toBeInTheDocument()
  })

  test("retries at once when the app regains focus", async () => {
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    onUpdate.mockResolvedValueOnce("unreached")
    await userEvent.fill(screen.getByLabelText("Note"), "Socks, shoes")
    await expect.element(screen.getByLabelText("Note")).toHaveAccessibleDescription("Not saved")

    window.dispatchEvent(new Event("focus"))
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2), AT_ONCE)
    expect(onUpdate).toHaveBeenLastCalledWith({ body: "Socks, shoes" }, NOW)
    await expect.element(screen.getByLabelText("Note")).not.toHaveAccessibleDescription()
  })

  test("retries at once on reconnecting", async () => {
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    onUpdate.mockResolvedValueOnce("unreached")
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    await expect.element(screen.getByLabelText("Title")).toHaveAccessibleDescription("Not saved")

    window.dispatchEvent(new Event("online"))
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2), AT_ONCE)
    await expect.element(screen.getByLabelText("Title")).not.toHaveAccessibleDescription()
  })

  test("a new Note whose first save fails is created by the retry", async () => {
    const { screen, onCreate } = await renderEditor()
    onCreate.mockResolvedValueOnce("unreached")
    await userEvent.type(screen.getByLabelText("Note"), "Milk")
    await expect.element(screen.getByLabelText("Note")).toHaveAccessibleDescription("Not saved")

    window.dispatchEvent(new Event("online"))
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2), AT_ONCE)
    expect(onCreate).toHaveBeenLastCalledWith({ title: "", body: "Milk" }, NOW)
    await expect.element(screen.getByLabelText("Note")).not.toHaveAccessibleDescription()
  })

  test("a save the server refused is neither marked Not saved nor retried", async () => {
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    onUpdate.mockResolvedValueOnce("refused")
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1), SAVED_WITHIN)
    window.dispatchEvent(new Event("online"))
    await pause(300)
    expect(onUpdate).toHaveBeenCalledTimes(1)
    await expect.element(screen.getByText("Not saved")).not.toBeInTheDocument()
  })

  test("leaving tries once more, and nothing is kept for a reload", async () => {
    const first = await renderEditor({ note: packing, saved: true })
    first.onUpdate.mockResolvedValue("unreached")
    await userEvent.fill(first.screen.getByLabelText("Title"), "Trip")
    await expect
      .element(first.screen.getByLabelText("Title"))
      .toHaveAccessibleDescription("Not saved")
    await first.screen.unmount()
    expect(first.onUpdate).toHaveBeenLastCalledWith({ title: "Trip" }, LEAVING)
    expect(first.onUpdate).toHaveBeenCalledTimes(2)

    // After a reload the Note is as the server last stored it, and nothing is replayed.
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
    const second = await renderEditor({ note: packing, saved: true })
    await expect.element(second.screen.getByLabelText("Title")).toHaveValue("Packing")
    window.dispatchEvent(new Event("online"))
    await pause(1_500)
    expect(second.onUpdate).not.toHaveBeenCalled()
    expect(first.onUpdate).toHaveBeenCalledTimes(2)
  })
})

describe("leaving the page", () => {
  test("hiding the page sends pending typing at once, to outlive the page", async () => {
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    await userEvent.fill(screen.getByLabelText("Note"), "Socks and shoes")
    hidePage()
    await vi.waitFor(
      () => expect(onUpdate).toHaveBeenCalledWith({ body: "Socks and shoes" }, LEAVING),
      AT_ONCE,
    )
    // It is not sent a second time once the pause would have passed.
    await pause(1_500)
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  test("closing or navigating the page away sends pending typing at once", async () => {
    const { screen, onCreate } = await renderEditor()
    await userEvent.type(screen.getByLabelText("Title"), "Groceries")
    window.dispatchEvent(new PageTransitionEvent("pagehide"))
    await vi.waitFor(
      () => expect(onCreate).toHaveBeenCalledWith({ title: "Groceries", body: "" }, LEAVING),
      AT_ONCE,
    )
  })

  test("no unsaved-changes prompt holds up leaving", async () => {
    const { screen } = await renderEditor({ note: packing, saved: true })
    await userEvent.fill(screen.getByLabelText("Note"), "Socks and shoes")
    const leaving = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(false)
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
    await pause(1_500)
    await screen.unmount()
    expect(onCreate).not.toHaveBeenCalled()
  })

  test("a saved Note that is emptied is saved empty, not discarded", async () => {
    const { screen, onUpdate } = await renderEditor({
      note: { ...blank, body: "Gone soon", editedAt: "2026-10-01T09:00:00.000Z" },
      saved: true,
    })
    await userEvent.clear(screen.getByLabelText("Note"))
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ body: "" }, NOW), SAVED_WITHIN)
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
    // The Note is on the server, so it is deleted there.
    expect(await onDelete.mock.calls[0]![0]).toBe(true)
    // Typing still waiting to save is dropped with the Note: nothing saves after the delete.
    await pause(1_500)
    await screen.unmount()
    const deletedAt = onDelete.mock.invocationCallOrder[0]!
    expect(onUpdate.mock.invocationCallOrder.filter((order) => order > deletedAt)).toEqual([])
  })

  test("deleting a new Note that was never saved has nothing to delete on the server", async () => {
    const { screen, onDelete, onCreate } = await renderEditor()
    await confirmDelete(screen)
    expect(await onDelete.mock.calls[0]![0]).toBe(false)
    await screen.unmount()
    expect(onCreate).not.toHaveBeenCalled()
  })

  test("delete while the first save is in flight leaves no Note", async () => {
    const create = deferredSave()
    const { screen, onCreate, onUpdate, onDelete } = await renderEditor()
    onCreate.mockImplementation(() => create.promise)
    await userEvent.type(screen.getByLabelText("Title"), "Groceries")
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled(), SAVED_WITHIN)
    // More typing waits behind the create; then the Note is deleted.
    await userEvent.type(screen.getByLabelText("Note"), "Milk")
    await confirmDelete(screen)
    expect(onDelete).toHaveBeenCalledTimes(1)
    let onServer: boolean | undefined
    void onDelete.mock.calls[0]![0].then((stored) => {
      onServer = stored
    })

    // The delete waits for the create to land, then deletes what it stored.
    await pause(100)
    expect(onServer).toBeUndefined()
    create.resolve("saved")
    await vi.waitFor(() => expect(onServer).toBe(true))

    // Nothing typed before the delete is saved after it.
    await pause(1_500)
    await screen.unmount()
    expect(onUpdate).not.toHaveBeenCalled()
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  test("a first save that fails while deleting leaves nothing to delete", async () => {
    const create = deferredSave()
    const { screen, onCreate, onDelete } = await renderEditor()
    onCreate.mockImplementation(() => create.promise)
    await userEvent.type(screen.getByLabelText("Title"), "Groceries")
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalled(), SAVED_WITHIN)
    await confirmDelete(screen)
    create.resolve("refused")
    expect(await onDelete.mock.calls[0]![0]).toBe(false)
  })
})

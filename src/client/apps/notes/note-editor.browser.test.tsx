import "@/styles.css"
import { afterEach, describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { NoteEditor, type NoteEditorProps } from "@/apps/notes/note-editor"
import type { KeptItems, StoredItem } from "@/apps/notes/use-note-draft"
import type { ItemChanges, NewItem, NoteFields, SaveOptions, SaveOutcome } from "@/data/notes"
import { instantAt } from "@shared/dates"
import type { NotePerson } from "@shared/notes/schemas"

/** Comfortably past the ~1 s pause after which typing saves. */
const SAVED_WITHIN = { timeout: 2_500 }

const me = { id: "me", name: "Mara" }
const ana = { id: "ana", name: "Ana" }
const ben = { id: "ben", name: "Ben" }

const blank = {
  kind: "text",
  title: null,
  body: "",
  editedAt: null,
  creator: me,
  audience: [],
} as const

const SHARE_LINE =
  "Everyone you pick can read and edit it. Only you can change this or delete the note."

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
    onAddItem: vi.fn<(item: NewItem, options: SaveOptions) => Promise<SaveOutcome>>(() =>
      Promise.resolve("saved"),
    ),
    onUpdateItemText: vi.fn<
      (id: string, text: string, options: SaveOptions) => Promise<SaveOutcome>
    >(() => Promise.resolve("saved")),
    onUpdateItem: vi.fn<(id: string, changes: ItemChanges) => Promise<StoredItem | null>>(() =>
      Promise.resolve(null),
    ),
    onDeleteItem: vi.fn<(id: string) => Promise<boolean>>(() => Promise.resolve(true)),
    onClearChecked: vi.fn<(ids: string[]) => Promise<KeptItems | null>>(() =>
      Promise.resolve({ kept: [] }),
    ),
    onDelete: vi.fn<(onServer: Promise<boolean>) => void>(),
    onBack: vi.fn<() => void>(),
    onShare: vi.fn<(audience: NotePerson[]) => void>(),
  }
}

async function renderEditor(props: Partial<NoteEditorProps> = {}) {
  const spies = callbacks()
  const screen = await render(
    <NoteEditor
      note={blank}
      saved={false}
      viewerId={me.id}
      people={[ana, ben]}
      {...spies}
      {...props}
    />,
  )
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

  test("returning to the app retries each Not saved field once", async () => {
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    onUpdate.mockResolvedValueOnce("unreached")
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    await expect.element(screen.getByLabelText("Title")).toHaveAccessibleDescription("Not saved")

    // Coming back fires both a visibility change and focus; the retry still goes once.
    onUpdate.mockImplementation(() => new Promise<SaveOutcome>(() => {}))
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("focus"))
    await pause(300)
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  test("a create that throws leaves the Note to be created by the next save", async () => {
    const { screen, onCreate } = await renderEditor()
    onCreate.mockImplementationOnce(() => {
      throw new Error("Already in the collection")
    })
    await userEvent.fill(screen.getByLabelText("Title"), "Groceries")
    await vi.waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1), SAVED_WITHIN)
    await userEvent.fill(screen.getByLabelText("Note"), "Milk")
    await vi.waitFor(
      () => expect(onCreate).toHaveBeenLastCalledWith({ title: "Groceries", body: "Milk" }, NOW),
      SAVED_WITHIN,
    )
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

  test("hiding the page sends every field still pausing at once, side by side", async () => {
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    await userEvent.fill(screen.getByLabelText("Note"), "Socks and shoes")
    // Neither save settles, as on a page being unloaded: both must already be on their way.
    onUpdate.mockImplementation(() => new Promise<SaveOutcome>(() => {}))
    hidePage()
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2), AT_ONCE)
    expect(onUpdate).toHaveBeenCalledWith({ title: "Trip" }, LEAVING)
    expect(onUpdate).toHaveBeenCalledWith({ body: "Socks and shoes" }, LEAVING)
  })

  test("leaving sends new typing at once even while an earlier save is on its way", async () => {
    const earlier = deferredSave()
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    onUpdate.mockImplementationOnce(() => earlier.promise)
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1), SAVED_WITHIN)
    await userEvent.fill(screen.getByLabelText("Title"), "Trip to the coast")
    await userEvent.fill(screen.getByLabelText("Note"), "Socks and shoes")
    window.dispatchEvent(new PageTransitionEvent("pagehide"))
    await vi.waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ title: "Trip to the coast" }, LEAVING)
      expect(onUpdate).toHaveBeenCalledWith({ body: "Socks and shoes" }, LEAVING)
    }, AT_ONCE)

    // If the page stays, the newest title goes once more after the earlier save, so it wins.
    earlier.resolve("saved")
    await vi.waitFor(() =>
      expect(onUpdate).toHaveBeenLastCalledWith({ title: "Trip to the coast" }, NOW),
    )
  })

  test("leaving a new Note sends one create carrying every field", async () => {
    const { screen, onCreate, onUpdate } = await renderEditor()
    await userEvent.fill(screen.getByLabelText("Title"), "Groceries")
    await userEvent.fill(screen.getByLabelText("Note"), "Milk")
    hidePage()
    await vi.waitFor(
      () => expect(onCreate).toHaveBeenCalledWith({ title: "Groceries", body: "Milk" }, LEAVING),
      AT_ONCE,
    )
    await pause(300)
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  test("a save after returning waits for the send made on leaving", async () => {
    const leaving = deferredSave()
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    onUpdate.mockImplementationOnce(() => leaving.promise)
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    hidePage()
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ title: "Trip" }, LEAVING))

    // Back again, typing more: it saves only once the earlier send has landed.
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    await userEvent.fill(screen.getByLabelText("Title"), "Trip to the coast")
    await pause(1_500)
    expect(onUpdate).toHaveBeenCalledTimes(1)
    leaving.resolve("saved")
    await vi.waitFor(() =>
      expect(onUpdate).toHaveBeenLastCalledWith({ title: "Trip to the coast" }, NOW),
    )
  })

  test("typing back to the saved text saves it again while other text is on its way", async () => {
    const leaving = deferredSave()
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    await vi.waitFor(
      () => expect(onUpdate).toHaveBeenCalledWith({ title: "Trip" }, NOW),
      SAVED_WITHIN,
    )
    onUpdate.mockImplementationOnce(() => leaving.promise)
    await userEvent.fill(screen.getByLabelText("Title"), "Trip to the coast")
    hidePage()
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2))

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    leaving.resolve("saved")
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(3), SAVED_WITHIN)
    expect(onUpdate).toHaveBeenLastCalledWith({ title: "Trip" }, NOW)
  })

  test("hiding and then unloading the page sends each field once", async () => {
    const { screen, onUpdate } = await renderEditor({ note: packing, saved: true })
    onUpdate.mockImplementation(() => new Promise<SaveOutcome>(() => {}))
    await userEvent.fill(screen.getByLabelText("Title"), "Trip")
    hidePage()
    window.dispatchEvent(new PageTransitionEvent("pagehide"))
    await pause(300)
    expect(onUpdate).toHaveBeenCalledTimes(1)
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

describe("the header", () => {
  const saved = { ...blank, title: "Groceries", editedAt: "2026-10-01T09:00:00.000Z" }

  test("the Creator shares from a sheet of the people with access", async () => {
    const { screen, onShare } = await renderEditor({ note: saved, saved: true })
    await expect.element(screen.getByText(/Shared by/)).not.toBeInTheDocument()
    await screen.getByRole("button", { name: "Share" }).click()
    await expect.element(screen.getByText(SHARE_LINE)).toBeVisible()
    await expect.element(screen.getByRole("checkbox", { name: "Ana" })).not.toBeChecked()
    await screen.getByRole("checkbox", { name: "Ben" }).click()
    expect(onShare).toHaveBeenLastCalledWith([ben])
  })

  test("a shared Note's Creator sees its Audience on the button, and can remove a member", async () => {
    const { screen, onShare } = await renderEditor({
      note: { ...saved, audience: [ana, ben] },
      saved: true,
    })
    const button = screen.getByRole("button", { name: /Shared/ })
    await expect.element(button).toBeVisible()
    await expect.element(button.getByRole("img", { name: "Ana" })).toBeInTheDocument()
    await expect.element(button.getByRole("img", { name: "Ben" })).toBeInTheDocument()
    await button.click()
    await expect.element(screen.getByRole("checkbox", { name: "Ben" })).toBeChecked()
    await screen.getByRole("checkbox", { name: "Ana" }).click()
    expect(onShare).toHaveBeenLastCalledWith([ben])
  })

  test("the sheet still lists a member the people list leaves out, so they can be removed", async () => {
    const cy = { id: "cy", name: "Cy" }
    const { screen, onShare } = await renderEditor({
      note: { ...saved, audience: [cy] },
      saved: true,
    })
    await screen.getByRole("button", { name: /Shared/ }).click()
    await screen.getByRole("checkbox", { name: "Cy" }).click()
    expect(onShare).toHaveBeenLastCalledWith([])
  })

  test("the Creator can delete from the ⋯ menu", async () => {
    const { screen } = await renderEditor({ note: saved, saved: true })
    await screen.getByRole("button", { name: "More" }).click()
    await expect.element(screen.getByRole("menuitem", { name: "Delete note" })).toBeVisible()
  })

  test("a member sees who shared it, edits it, and can neither share nor delete it", async () => {
    const { screen, onUpdate } = await renderEditor({
      note: { ...saved, creator: ana, audience: [me, ben] },
      saved: true,
    })
    await expect.element(screen.getByText("Shared by Ana")).toBeVisible()
    await expect.element(screen.getByRole("img", { name: "Ana" })).toBeVisible()
    await expect
      .element(screen.getByRole("button", { name: "Share", exact: true }))
      .not.toBeInTheDocument()
    await expect.element(screen.getByRole("button", { name: "More" })).not.toBeInTheDocument()
    await expect.element(screen.getByText("Delete note")).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText("Note"), "Eggs")
    await vi.waitFor(
      () => expect(onUpdate).toHaveBeenCalledWith({ body: "Eggs" }, NOW),
      SAVED_WITHIN,
    )
  })

  test("a member sees everyone who can see it, and can change none of it", async () => {
    const { screen, onShare } = await renderEditor({
      note: { ...saved, creator: ana, audience: [me, ben] },
      saved: true,
    })
    await screen.getByRole("button", { name: /Shared by Ana/ }).click()
    const sheet = screen.getByRole("dialog", { name: "Who can see this note" })
    await expect.element(sheet).toBeVisible()
    expect(
      sheet
        .getByRole("listitem")
        .elements()
        .map((row) => row.textContent),
    ).toEqual(["AAnaCreator", "MYou", "BBen"])
    await expect.element(sheet.getByRole("checkbox")).not.toBeInTheDocument()
    await expect.element(sheet.getByText(SHARE_LINE)).not.toBeInTheDocument()
    expect(onShare).not.toHaveBeenCalled()
  })

  test("a new Note can't be shared until it is saved", async () => {
    const { screen } = await renderEditor()
    await expect.element(screen.getByLabelText("Title")).toBeVisible()
    await expect.element(screen.getByRole("button", { name: "Share" })).not.toBeInTheDocument()
  })
})

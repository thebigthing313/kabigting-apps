import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { NoteEditor, type NoteEditorProps } from "@/apps/notes/note-editor"
import type { StoredItem } from "@/apps/notes/use-note-draft"
import type { ItemChanges, NewItem, NoteFields } from "@/data/notes"
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
  const settle: { resolve?: (stored: boolean) => void } = {}
  const promise = new Promise<boolean>((resolve) => {
    settle.resolve = resolve
  })
  return { promise, resolve: (stored: boolean) => settle.resolve?.(stored) }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function confirmDelete(screen: Awaited<ReturnType<typeof render>>) {
  await screen.getByRole("button", { name: "More" }).click()
  await screen.getByRole("menuitem", { name: "Delete note" }).click()
  await screen.getByRole("button", { name: "Delete" }).click()
}

function callbacks() {
  return {
    onCreate: vi.fn<(fields: NoteFields) => Promise<boolean>>(() => Promise.resolve(true)),
    onUpdate: vi.fn<(changes: Partial<NoteFields>) => Promise<boolean>>(() =>
      Promise.resolve(true),
    ),
    onAddItem: vi.fn<(item: NewItem) => Promise<boolean>>(() => Promise.resolve(true)),
    onUpdateItem: vi.fn<(id: string, changes: ItemChanges) => Promise<StoredItem | null>>(() =>
      Promise.resolve(null),
    ),
    onDeleteItem: vi.fn<(id: string) => Promise<boolean>>(() => Promise.resolve(true)),
    onDelete: vi.fn<(onServer: Promise<boolean>) => void>(),
    onLeave: vi.fn<(settled: Promise<unknown>) => void>(),
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
    create.resolve(true)
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
    create.resolve(false)
    expect(await onDelete.mock.calls[0]![0]).toBe(false)
  })

  test("an Audience member Leaves from the ⋯ menu at once, and can't delete", async () => {
    const { screen, onLeave, onDelete, onUpdate } = await renderEditor({
      note: { ...blank, title: "Old", editedAt: "2026-10-01T09:00:00.000Z", creator: ana },
      saved: true,
    })
    await screen.getByRole("button", { name: "More" }).click()
    await expect
      .element(screen.getByRole("menuitem", { name: "Delete note" }))
      .not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")

    await userEvent.type(screen.getByLabelText("Title"), " news")
    await screen.getByRole("button", { name: "More" }).click()
    await screen.getByRole("menuitem", { name: "Leave note" }).click()
    // Nothing to confirm: the Note stays for everyone else, and its Creator can add them back.
    expect(onLeave).toHaveBeenCalledTimes(1)
    await onLeave.mock.calls[0]![0]
    expect(onDelete).not.toHaveBeenCalled()
    // Typing still waiting to save is dropped: nothing saves to a Note they have left.
    await pause(1_500)
    await screen.unmount()
    const leftAt = onLeave.mock.invocationCallOrder[0]!
    expect(onUpdate.mock.invocationCallOrder.filter((order) => order > leftAt)).toEqual([])
  })

  test("the Creator's ⋯ menu offers Delete, not Leave", async () => {
    const { screen } = await renderEditor({
      note: { ...blank, title: "Old", editedAt: "2026-10-01T09:00:00.000Z", audience: [ana] },
      saved: true,
    })
    await screen.getByRole("button", { name: "More" }).click()
    await expect.element(screen.getByRole("menuitem", { name: "Delete note" })).toBeVisible()
    await expect
      .element(screen.getByRole("menuitem", { name: "Leave note" }))
      .not.toBeInTheDocument()
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
    await screen.getByRole("button", { name: "More" }).click()
    await expect.element(screen.getByRole("menuitem", { name: "Leave note" })).toBeVisible()
    await expect.element(screen.getByText("Delete note")).not.toBeInTheDocument()
    await userEvent.keyboard("{Escape}")

    await userEvent.type(screen.getByLabelText("Note"), "Eggs")
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ body: "Eggs" }), SAVED_WITHIN)
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

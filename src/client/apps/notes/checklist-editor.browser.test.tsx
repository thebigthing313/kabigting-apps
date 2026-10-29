import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { NoteEditor, type NoteEditorProps } from "@/apps/notes/note-editor"
import type { KeptItems, DraftItem, StoredItem } from "@/apps/notes/use-note-draft"
import type { ItemChanges, NewItem, NoteFields } from "@/data/notes"
import { instantAt } from "@shared/dates"

/** Comfortably past the ~1 s pause after which typing saves. */
const SAVED_WITHIN = { timeout: 2_500 }
/** Well inside the typing pause: what saves "at once" has saved by then. */
const AT_ONCE = { timeout: 300 }

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const me = { id: "me", name: "Mara" }

const blank = {
  kind: "checklist",
  title: null,
  body: null,
  editedAt: null,
  creator: me,
  audience: [],
} as const
const saved = { ...blank, title: "Groceries", editedAt: "2026-10-01T09:00:00.000Z" } as const

function item(name: string, position: string, checkedAt: string | null = null): DraftItem {
  return { id: `id-${name}`, text: name, position, checked: checkedAt !== null, checkedAt }
}

function callbacks() {
  return {
    onCreate: vi.fn<(fields: NoteFields) => Promise<boolean>>(() => Promise.resolve(true)),
    onUpdate: vi.fn<(changes: Partial<NoteFields>) => Promise<boolean>>(() =>
      Promise.resolve(true),
    ),
    onAddItem: vi.fn<(item: NewItem) => Promise<boolean>>(() => Promise.resolve(true)),
    // The server stamps a tick with its own time.
    onUpdateItem: vi.fn<(id: string, changes: ItemChanges) => Promise<StoredItem | null>>(
      (_id, changes) =>
        Promise.resolve({ checkedAt: changes.checked ? instantAt(Date.now()) : null }),
    ),
    onDeleteItem: vi.fn<(id: string) => Promise<boolean>>(() => Promise.resolve(true)),
    onClearChecked: vi.fn<(ids: string[]) => Promise<KeptItems | null>>(() =>
      Promise.resolve({ kept: [] }),
    ),
    onDelete: vi.fn<(onServer: Promise<boolean>) => void>(),
    onLeave: vi.fn(),
    onBack: vi.fn<() => void>(),
    onShare: vi.fn(),
  }
}

async function renderChecklist(props: Partial<NoteEditorProps> = {}) {
  const spies = callbacks()
  const screen = await render(
    <NoteEditor note={blank} saved={false} viewerId={me.id} people={[]} {...spies} {...props} />,
  )
  const listed = (name: "To do" | "Checked") =>
    screen
      .getByRole("list", { name })
      .getByRole("textbox", { name: "Item" })
      .elements()
      .map((input) => (input instanceof HTMLInputElement ? input.value : ""))
  return { screen, listed, ...spies }
}

async function renderSaved(items: DraftItem[]) {
  return renderChecklist({ note: saved, saved: true, items })
}

/** The time on a server whose clock runs an hour ahead of this device's. */
const serverNow = () => instantAt(Date.now() + 60 * 60_000)

/** A save the test settles by hand, to act while it is in flight. */
function deferredSave() {
  const settle: { resolve?: (stored: boolean) => void } = {}
  const promise = new Promise<boolean>((resolve) => {
    settle.resolve = resolve
  })
  return { promise, resolve: (stored: boolean) => settle.resolve?.(stored) }
}

describe("a new Checklist", () => {
  test("opens with a title and an Add item row, and no body", async () => {
    const { screen } = await renderChecklist()
    await expect.element(screen.getByLabelText("Title")).toBeVisible()
    await expect.element(screen.getByRole("textbox", { name: "Add item" })).toHaveFocus()
    await expect.element(screen.getByLabelText("Note")).not.toBeInTheDocument()
  })

  test("is created by its first Item, which is then added to it", async () => {
    const { screen, listed, onCreate, onAddItem } = await renderChecklist()
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Milk{Enter}")
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Eggs{Enter}")
    await vi.waitFor(() => expect(onAddItem).toHaveBeenCalledTimes(2), AT_ONCE)
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith({ title: "", body: "" })
    expect(onCreate.mock.invocationCallOrder[0]).toBeLessThan(
      onAddItem.mock.invocationCallOrder[0]!,
    )
    expect(onAddItem.mock.calls.map(([added]) => added.text)).toEqual(["Milk", "Eggs"])
    expect(listed("To do")).toEqual(["Milk", "Eggs"])
    await expect.element(screen.getByRole("textbox", { name: "Add item" })).toHaveValue("")
  })

  test("with only blank Items is discarded on leaving", async () => {
    const { screen, onCreate, onAddItem } = await renderChecklist()
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "   {Enter}")
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "  ")
    await screen.unmount()
    await pause(100)
    expect(onCreate).not.toHaveBeenCalled()
    expect(onAddItem).not.toHaveBeenCalled()
  })

  test("text left in the Add item row is added on leaving", async () => {
    const { screen, onCreate, onAddItem } = await renderChecklist()
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Bread")
    await screen.unmount()
    await vi.waitFor(() =>
      expect(onAddItem).toHaveBeenCalledWith(expect.objectContaining({ text: "Bread" })),
    )
    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})

describe("Items", () => {
  test("a new Item goes to the bottom of the unchecked Items", async () => {
    const { screen, listed, onAddItem, onCreate } = await renderSaved([
      item("Milk", "c"),
      item("Eggs", "s"),
      item("Jam", "z", "2026-10-01T09:00:00.000Z"),
    ])
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Bread{Enter}")
    await vi.waitFor(() => expect(onAddItem).toHaveBeenCalledTimes(1), AT_ONCE)
    expect(listed("To do")).toEqual(["Milk", "Eggs", "Bread"])
    expect(onAddItem.mock.calls[0]![0].position > "s").toBe(true)
    expect(onCreate).not.toHaveBeenCalled()
  })

  test("editing an Item's text writes only that Item, once typing pauses", async () => {
    const { screen, onUpdateItem, onUpdate } = await renderSaved([
      item("Milk", "c"),
      item("Eggs", "s"),
    ])
    await userEvent.fill(screen.getByRole("textbox", { name: "Item" }).first(), "Oat milk")
    await pause(300)
    expect(onUpdateItem).not.toHaveBeenCalled()
    await vi.waitFor(
      () => expect(onUpdateItem).toHaveBeenCalledWith("id-Milk", { text: "Oat milk" }),
      SAVED_WITHIN,
    )
    expect(onUpdateItem).toHaveBeenCalledTimes(1)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  test("a blank Item is dropped when left", async () => {
    const { screen, listed, onUpdateItem, onDeleteItem } = await renderSaved([
      item("Milk", "c"),
      item("Eggs", "s"),
    ])
    await userEvent.clear(screen.getByRole("textbox", { name: "Item" }).first())
    await screen.getByLabelText("Title").click()
    await vi.waitFor(() => expect(onDeleteItem).toHaveBeenCalledWith("id-Milk"), AT_ONCE)
    expect(listed("To do")).toEqual(["Eggs"])
    await pause(1_200)
    expect(onUpdateItem).not.toHaveBeenCalled()
  })

  test("the delete button deletes only that Item, at once", async () => {
    const { screen, listed, onDeleteItem } = await renderSaved([
      item("Milk", "c"),
      item("Eggs", "s"),
    ])
    await screen.getByRole("button", { name: "Delete item" }).nth(1).click()
    await vi.waitFor(() => expect(onDeleteItem).toHaveBeenCalledWith("id-Eggs"), AT_ONCE)
    expect(onDeleteItem).toHaveBeenCalledTimes(1)
    expect(listed("To do")).toEqual(["Milk"])
  })
})

describe("ticking", () => {
  test("an Audience member ticks an Item of a Checklist someone else made", async () => {
    const ana = { id: "ana", name: "Ana" }
    const { screen, onUpdateItem } = await renderChecklist({
      note: { ...saved, creator: ana, audience: [me] },
      saved: true,
      items: [item("Milk", "c")],
    })
    await expect.element(screen.getByText("Shared by Ana")).toBeVisible()
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await vi.waitFor(
      () => expect(onUpdateItem).toHaveBeenCalledWith("id-Milk", { checked: true }),
      AT_ONCE,
    )
  })

  test("saves at once and folds the Item, struck through, under N checked", async () => {
    const { screen, listed, onUpdateItem } = await renderSaved([
      item("Milk", "c"),
      item("Eggs", "s"),
    ])
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await vi.waitFor(
      () => expect(onUpdateItem).toHaveBeenCalledWith("id-Milk", { checked: true }),
      AT_ONCE,
    )
    expect(listed("To do")).toEqual(["Eggs"])
    expect(listed("Checked")).toEqual(["Milk"])
    await expect.element(screen.getByRole("button", { name: "1 checked" })).toBeVisible()
    await expect
      .element(screen.getByRole("list", { name: "Checked" }).getByRole("textbox"))
      .toHaveStyle({ textDecorationLine: "line-through" })
  })

  test("checked Items show the most recently checked first", async () => {
    const { screen, listed } = await renderSaved([
      item("Milk", "c", "2026-10-01T09:00:00.000Z"),
      item("Eggs", "s", "2026-10-01T09:10:00.000Z"),
      item("Jam", "i", "2026-10-01T09:05:00.000Z"),
    ])
    await expect.element(screen.getByRole("button", { name: "3 checked" })).toBeVisible()
    expect(listed("Checked")).toEqual(["Eggs", "Jam", "Milk"])
  })

  test("the newest tick goes to the top of the checked Items", async () => {
    const { screen, listed } = await renderSaved([
      item("Milk", "c"),
      item("Jam", "i", "2026-10-01T09:05:00.000Z"),
    ])
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    expect(listed("Checked")).toEqual(["Milk", "Jam"])
  })

  test("the N checked section collapses and opens again", async () => {
    const { screen } = await renderSaved([item("Milk", "c"), item("Jam", "i", saved.editedAt)])
    const toggle = screen.getByRole("button", { name: "1 checked" })
    await expect.element(toggle).toHaveAttribute("aria-expanded", "true")
    await toggle.click()
    await expect.element(toggle).toHaveAttribute("aria-expanded", "false")
    await expect.element(screen.getByRole("list", { name: "Checked" })).not.toBeInTheDocument()
    await toggle.click()
    await expect.element(screen.getByRole("list", { name: "Checked" })).toBeVisible()
  })

  test("unticking saves at once and returns the Item to the bottom of the unchecked", async () => {
    const { screen, listed, onUpdateItem } = await renderSaved([
      item("Milk", "c"),
      item("Eggs", "s"),
      item("Jam", "a", "2026-10-01T09:05:00.000Z"),
    ])
    await screen.getByRole("checkbox", { name: "Jam" }).click()
    await vi.waitFor(
      () => expect(onUpdateItem).toHaveBeenCalledWith("id-Jam", { checked: false }),
      AT_ONCE,
    )
    expect(listed("To do")).toEqual(["Milk", "Eggs", "Jam"])
    await expect.element(screen.getByRole("button", { name: /checked/ })).not.toBeInTheDocument()
  })

  test("checked Items order by the server's tick time, not this device's clock", async () => {
    // This device's clock runs an hour behind the server's.
    const { screen, listed, onUpdateItem } = await renderSaved([
      item("Milk", "c"),
      item("Jam", "i", serverNow()),
    ])
    onUpdateItem.mockImplementation(() => Promise.resolve({ checkedAt: serverNow() }))
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await vi.waitFor(() => expect(listed("Checked")).toEqual(["Milk", "Jam"]), AT_ONCE)
  })

  test("an Item ticked while it is still being added is ticked once it lands", async () => {
    const add = deferredSave()
    const { screen, onAddItem, onUpdateItem } = await renderSaved([])
    onAddItem.mockImplementation(() => add.promise)
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Milk{Enter}")
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await pause(100)
    expect(onUpdateItem).not.toHaveBeenCalled()
    add.resolve(true)
    await vi.waitFor(() => expect(onUpdateItem).toHaveBeenCalled(), AT_ONCE)
    await pause(100)
    expect(onAddItem).toHaveBeenCalledTimes(1)
    expect(onUpdateItem.mock.calls).toEqual([[expect.any(String), { checked: true }]])
  })

  test("an Item ticked right after typing saves its text first", async () => {
    const { screen, onUpdateItem } = await renderSaved([item("Milk", "c")])
    await userEvent.fill(screen.getByRole("textbox", { name: "Item" }), "Oat milk")
    await screen.getByRole("checkbox", { name: "Oat milk" }).click()
    await vi.waitFor(() => expect(onUpdateItem).toHaveBeenCalledTimes(2), AT_ONCE)
    expect(onUpdateItem.mock.calls).toEqual([
      ["id-Milk", { text: "Oat milk" }],
      ["id-Milk", { checked: true }],
    ])
  })
})

/** Drags an element by `dy` pixels with a finger or a mouse: down, a few moves, then up. */
async function drag(handle: Element, dy: number, pointerType: "touch" | "mouse" = "touch") {
  const box = handle.getBoundingClientRect()
  const x = box.left + box.width / 2
  const y = box.top + box.height / 2
  const at = (type: string, clientY: number) =>
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 7,
      pointerType,
      button: 0,
      clientX: x,
      clientY,
    })
  handle.dispatchEvent(at("pointerdown", y))
  for (let step = 1; step <= 8; step += 1) {
    document.dispatchEvent(at("pointermove", y + (dy * step) / 8))
    await pause(16)
  }
  document.dispatchEvent(at("pointerup", y + dy))
  await pause(16)
}

/** Picks an Item up by its handle with the keyboard, moves it one place and drops it. */
async function keyboardMove(handle: Element, arrow: "{ArrowDown}" | "{ArrowUp}") {
  if (handle instanceof HTMLElement) handle.focus()
  await userEvent.keyboard(" ")
  await pause(50)
  await userEvent.keyboard(arrow)
  await pause(50)
  await userEvent.keyboard(" ")
}

const keyboardMoveDown = (handle: Element) => keyboardMove(handle, "{ArrowDown}")
const keyboardMoveUp = (handle: Element) => keyboardMove(handle, "{ArrowUp}")

/** Three unchecked Items and a checked one. */
const shopping = () => [
  item("Milk", "c"),
  item("Eggs", "i"),
  item("Bread", "s"),
  item("Jam", "a", "2026-10-01T09:05:00.000Z"),
]

describe("reordering", () => {
  test("dragging an Item's handle by touch moves it, writing only its position", async () => {
    const { screen, listed, onUpdateItem } = await renderSaved(shopping())
    const lines = screen.getByRole("list", { name: "To do" }).getByRole("listitem")
    const lineHeight = lines.first().element().getBoundingClientRect().height
    await drag(screen.getByRole("button", { name: "Reorder Bread" }).element(), -2 * lineHeight)
    await vi.waitFor(() => expect(listed("To do")).toEqual(["Bread", "Milk", "Eggs"]), AT_ONCE)
    await vi.waitFor(() => expect(onUpdateItem).toHaveBeenCalledTimes(1), AT_ONCE)
    const [id, changes] = onUpdateItem.mock.calls[0]!
    expect(id).toBe("id-Bread")
    expect(Object.keys(changes)).toEqual(["position"])
    expect(changes.position! < "c").toBe(true)
    expect(listed("Checked")).toEqual(["Jam"])
  })

  test("dragging an Item's handle with a mouse moves it", async () => {
    const { screen, listed, onUpdateItem } = await renderSaved(shopping())
    const lines = screen.getByRole("list", { name: "To do" }).getByRole("listitem")
    const lineHeight = lines.first().element().getBoundingClientRect().height
    const handle = screen.getByRole("button", { name: "Reorder Milk" }).element()
    await drag(handle, 2 * lineHeight, "mouse")
    await vi.waitFor(() => expect(listed("To do")).toEqual(["Eggs", "Bread", "Milk"]), AT_ONCE)
    await vi.waitFor(() => expect(onUpdateItem).toHaveBeenCalledTimes(1), AT_ONCE)
    const [id, changes] = onUpdateItem.mock.calls[0]!
    expect(id).toBe("id-Milk")
    expect(changes.position! > "s").toBe(true)
  })

  test("the handle moves an Item with the keyboard too", async () => {
    const { screen, listed, onUpdateItem } = await renderSaved(shopping())
    await keyboardMoveDown(screen.getByRole("button", { name: "Reorder Milk" }).element())
    await vi.waitFor(() => expect(listed("To do")).toEqual(["Eggs", "Milk", "Bread"]), AT_ONCE)
    await vi.waitFor(() => expect(onUpdateItem).toHaveBeenCalledTimes(1), AT_ONCE)
    const [id, changes] = onUpdateItem.mock.calls[0]!
    expect(id).toBe("id-Milk")
    expect(changes.position! > "i" && changes.position! < "s").toBe(true)
  })

  test("a drop back where it started writes nothing", async () => {
    const { screen, listed, onUpdateItem } = await renderSaved(shopping())
    await drag(screen.getByRole("button", { name: "Reorder Eggs" }).element(), 6)
    await pause(100)
    expect(listed("To do")).toEqual(["Milk", "Eggs", "Bread"])
    expect(onUpdateItem).not.toHaveBeenCalled()
  })

  test("an Item moved while it is still being added keeps its place once it lands", async () => {
    const add = deferredSave()
    const { screen, listed, onAddItem, onUpdateItem } = await renderSaved([
      item("Milk", "c"),
      item("Eggs", "i"),
    ])
    onAddItem.mockImplementation(() => add.promise)
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Bread{Enter}")
    await keyboardMoveUp(screen.getByRole("button", { name: "Reorder Bread" }).element())
    await vi.waitFor(() => expect(listed("To do")).toEqual(["Milk", "Bread", "Eggs"]), AT_ONCE)
    await pause(100)
    expect(onUpdateItem).not.toHaveBeenCalled()
    add.resolve(true)
    // The server put the new Item at the bottom; the move then sets its place.
    await vi.waitFor(() => expect(onUpdateItem).toHaveBeenCalledTimes(1), AT_ONCE)
    const [id, changes] = onUpdateItem.mock.calls[0]!
    expect(id).toBe(onAddItem.mock.calls[0]![0].id)
    expect(changes.position! > "c" && changes.position! < "i").toBe(true)
  })

  test("an Item whose add failed is added again when moved, then moved", async () => {
    const { screen, onAddItem, onUpdateItem } = await renderSaved([
      item("Milk", "c"),
      item("Eggs", "i"),
    ])
    onAddItem.mockImplementationOnce(() => Promise.resolve(false))
    await userEvent.type(screen.getByRole("textbox", { name: "Add item" }), "Bread{Enter}")
    await vi.waitFor(() => expect(onAddItem).toHaveBeenCalledTimes(1), AT_ONCE)
    await keyboardMoveUp(screen.getByRole("button", { name: "Reorder Bread" }).element())
    await vi.waitFor(() => expect(onUpdateItem).toHaveBeenCalledTimes(1), AT_ONCE)
    expect(onAddItem).toHaveBeenCalledTimes(2)
    expect(onAddItem.mock.invocationCallOrder[1]).toBeLessThan(
      onUpdateItem.mock.invocationCallOrder[0]!,
    )
    expect(Object.keys(onUpdateItem.mock.calls[0]![1])).toEqual(["position"])
  })

  test("a move the server refuses is undone", async () => {
    const { screen, listed, onUpdateItem } = await renderSaved(shopping())
    onUpdateItem.mockImplementation(() => Promise.resolve(null))
    await keyboardMoveDown(screen.getByRole("button", { name: "Reorder Milk" }).element())
    await vi.waitFor(() => expect(onUpdateItem).toHaveBeenCalledTimes(1), AT_ONCE)
    await vi.waitFor(() => expect(listed("To do")).toEqual(["Milk", "Eggs", "Bread"]), AT_ONCE)
  })

  test("checked Items have no handle", async () => {
    const { screen } = await renderSaved(shopping())
    await expect.element(screen.getByRole("button", { name: "Reorder Milk" })).toBeVisible()
    await expect
      .element(
        screen.getByRole("list", { name: "Checked" }).getByRole("button", { name: /Reorder/ }),
      )
      .not.toBeInTheDocument()
  })
})

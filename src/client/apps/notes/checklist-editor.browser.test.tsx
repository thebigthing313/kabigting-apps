import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { NoteEditor, type NoteEditorProps } from "@/apps/notes/note-editor"
import type { DraftItem } from "@/apps/notes/use-note-draft"
import type { ItemChanges, NewItem, NoteFields } from "@/data/notes"

/** Comfortably past the ~1 s pause after which typing saves. */
const SAVED_WITHIN = { timeout: 2_500 }
/** Well inside the typing pause: what saves "at once" has saved by then. */
const AT_ONCE = { timeout: 300 }

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const blank = { kind: "checklist", title: null, body: null, editedAt: null } as const
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
    onUpdateItem: vi.fn<(id: string, changes: ItemChanges) => Promise<boolean>>(() =>
      Promise.resolve(true),
    ),
    onDeleteItem: vi.fn<(id: string) => Promise<boolean>>(() => Promise.resolve(true)),
    onDelete: vi.fn<(onServer: Promise<boolean>) => void>(),
    onBack: vi.fn<() => void>(),
  }
}

async function renderChecklist(props: Partial<NoteEditorProps> = {}) {
  const spies = callbacks()
  const screen = await render(<NoteEditor note={blank} saved={false} {...spies} {...props} />)
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

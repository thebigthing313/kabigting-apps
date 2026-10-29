import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { NoteEditor } from "@/apps/notes/note-editor"
import type { ClearedChecked, DraftItem, StoredItem } from "@/apps/notes/use-note-draft"
import type { ItemChanges, NewItem, NoteFields } from "@/data/notes"
import { instantAt } from "@shared/dates"

/** Well inside the typing pause: what saves "at once" has saved by then. */
const AT_ONCE = { timeout: 300 }

const me = { id: "me", name: "Mara" }

const note = {
  kind: "checklist",
  title: "Groceries",
  body: null,
  editedAt: "2026-10-01T09:00:00.000Z",
  creator: me,
  audience: [],
} as const

function item(name: string, position: string, checkedAt: string | null = null): DraftItem {
  return { id: `id-${name}`, text: name, position, checked: checkedAt !== null, checkedAt }
}

/** A clear the test settles by hand, to look at the Checklist while it is in flight. */
function deferredClear() {
  const settle: { resolve?: (result: ClearedChecked | null) => void } = {}
  const promise = new Promise<ClearedChecked | null>((resolve) => {
    settle.resolve = resolve
  })
  return { promise, resolve: (result: ClearedChecked | null) => settle.resolve?.(result) }
}

async function renderChecklist(items: DraftItem[]) {
  const spies = {
    onCreate: vi.fn<(fields: NoteFields) => Promise<boolean>>(() => Promise.resolve(true)),
    onUpdate: vi.fn<(changes: Partial<NoteFields>) => Promise<boolean>>(() =>
      Promise.resolve(true),
    ),
    onAddItem: vi.fn<(item: NewItem) => Promise<boolean>>(() => Promise.resolve(true)),
    onUpdateItem: vi.fn<(id: string, changes: ItemChanges) => Promise<StoredItem | null>>(
      (_id, changes) =>
        Promise.resolve({ checkedAt: changes.checked ? instantAt(Date.now()) : null }),
    ),
    onDeleteItem: vi.fn<(id: string) => Promise<boolean>>(() => Promise.resolve(true)),
    // The server clears everything sent, keeping nothing.
    onClearChecked: vi.fn<(ids: string[]) => Promise<ClearedChecked | null>>(() =>
      Promise.resolve({ kept: [] }),
    ),
    onDelete: vi.fn<(onServer: Promise<boolean>) => void>(),
    onBack: vi.fn<() => void>(),
    onShare: vi.fn(),
  }
  const screen = await render(
    <NoteEditor note={note} saved items={items} viewerId={me.id} people={[]} {...spies} />,
  )
  const listed = (name: "To do" | "Checked") =>
    screen
      .getByRole("list", { name })
      .getByRole("textbox", { name: "Item" })
      .elements()
      .map((input) => (input instanceof HTMLInputElement ? input.value : ""))
  const clearButton = () => screen.getByRole("button", { name: "Clear checked" })
  return { screen, listed, clearButton, ...spies }
}

const EARLIER = "2026-10-01T09:00:00.000Z"
const LATER = "2026-10-01T09:05:00.000Z"

describe("Clear checked", () => {
  test("sits beside the N checked section, and only when something is checked", async () => {
    const { screen, clearButton } = await renderChecklist([item("Milk", "c")])
    await expect.element(clearButton()).not.toBeInTheDocument()
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await expect.element(clearButton()).toBeVisible()
  })

  test("deletes every checked Item at once, sending the ids seen checked", async () => {
    const { screen, listed, clearButton, onClearChecked } = await renderChecklist([
      item("Milk", "c"),
      item("Jam", "i", EARLIER),
      item("Bread", "s", LATER),
    ])
    await clearButton().click()
    await vi.waitFor(() => expect(onClearChecked).toHaveBeenCalledTimes(1), AT_ONCE)
    expect(onClearChecked.mock.calls[0]![0].toSorted()).toEqual(["id-Bread", "id-Jam"])
    expect(listed("To do")).toEqual(["Milk"])
    await expect.element(screen.getByRole("button", { name: /checked/ })).not.toBeInTheDocument()
  })

  test("still works while the checked Items are folded away", async () => {
    const { screen, listed, clearButton, onClearChecked } = await renderChecklist([
      item("Milk", "c"),
      item("Jam", "i", EARLIER),
    ])
    await screen.getByRole("button", { name: "1 checked" }).click()
    await clearButton().click()
    await vi.waitFor(() => expect(onClearChecked).toHaveBeenCalledWith(["id-Jam"]), AT_ONCE)
    expect(listed("To do")).toEqual(["Milk"])
  })

  test("a tick made just before clearing reaches the server first, and is cleared too", async () => {
    const { screen, listed, clearButton, onUpdateItem, onClearChecked } = await renderChecklist([
      item("Milk", "c"),
      item("Eggs", "s"),
      item("Jam", "i", EARLIER),
    ])
    await screen.getByRole("checkbox", { name: "Milk" }).click()
    await clearButton().click()
    await vi.waitFor(() => expect(onClearChecked).toHaveBeenCalledTimes(1), AT_ONCE)
    expect(onUpdateItem.mock.invocationCallOrder[0]).toBeLessThan(
      onClearChecked.mock.invocationCallOrder[0]!,
    )
    expect(onClearChecked.mock.calls[0]![0].toSorted()).toEqual(["id-Jam", "id-Milk"])
    expect(listed("To do")).toEqual(["Eggs"])
  })

  test("an Item someone else unticked first comes back unchecked", async () => {
    const { screen, listed, clearButton, onClearChecked } = await renderChecklist([
      item("Milk", "c"),
      item("Jam", "i", EARLIER),
      item("Bread", "s", LATER),
    ])
    onClearChecked.mockResolvedValue({
      kept: [{ ...item("Jam", "t"), checked: false, checkedAt: null }],
    })
    await clearButton().click()
    await vi.waitFor(() => expect(listed("To do")).toEqual(["Milk", "Jam"]), AT_ONCE)
    await expect.element(screen.getByRole("button", { name: /checked/ })).not.toBeInTheDocument()
  })

  test("a refused clear puts the checked Items back", async () => {
    const clear = deferredClear()
    const { listed, clearButton, onClearChecked } = await renderChecklist([
      item("Milk", "c"),
      item("Jam", "i", EARLIER),
      item("Bread", "s", LATER),
    ])
    onClearChecked.mockImplementation(() => clear.promise)
    await clearButton().click()
    await expect.element(clearButton()).not.toBeInTheDocument()
    clear.resolve(null)
    await expect.element(clearButton()).toBeVisible()
    expect(listed("Checked")).toEqual(["Bread", "Jam"])
    expect(listed("To do")).toEqual(["Milk"])
  })
})

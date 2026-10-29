import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { NotesList } from "@/apps/notes/notes-list"
import type { Item, Note } from "@/data/notes"
import { instantAt } from "@shared/dates"
import type { NoteKind } from "@shared/notes/schemas"

const minutesAgo = (minutes: number) => instantAt(Date.now() - minutes * 60_000)

function note(overrides: Partial<Note>): Note {
  return {
    id: "0190a000-0000-7000-8000-000000000000",
    kind: "text",
    title: null,
    body: "",
    creator: { id: "me", name: "Someone" },
    createdAt: minutesAgo(600),
    editedAt: minutesAgo(600),
    ...overrides,
  }
}

async function renderList(notes: Note[], items: Item[] = []) {
  const onNew = vi.fn<(kind: NoteKind) => void>()
  const onOpen = vi.fn<(id: string) => void>()
  const screen = await render(
    <NotesList notes={notes} items={items} onNew={onNew} onOpen={onOpen} />,
  )
  return { onNew, onOpen, screen }
}

describe("the New menu", () => {
  test("offers a Text note or a Checklist, and picking one asks for that kind", async () => {
    const { screen, onNew } = await renderList([])
    await screen.getByRole("button", { name: "New" }).click()
    await screen.getByRole("menuitem", { name: "Text note" }).click()
    expect(onNew).toHaveBeenLastCalledWith("text")
    await screen.getByRole("button", { name: "New" }).click()
    await screen.getByRole("menuitem", { name: "Checklist" }).click()
    expect(onNew).toHaveBeenLastCalledWith("checklist")
  })
})

describe("the list", () => {
  test("shows each Note newest edit first, with its icon, title or start of body and edit time", async () => {
    const { screen, onOpen } = await renderList([
      note({
        id: "0190a000-0000-7000-8000-00000000000a",
        title: "Packing",
        editedAt: minutesAgo(180),
      }),
      note({
        id: "0190a000-0000-7000-8000-00000000000b",
        body: "Call the plumber\nabout the sink",
        editedAt: minutesAgo(5),
      }),
    ])
    await expect.element(screen.getByText("Call the plumber")).toBeVisible()
    const rows = screen.getByRole("listitem")
    expect(rows.elements().map((row) => row.textContent)).toEqual([
      "Call the plumberabout the sink5 minutes ago",
      "Packing3 hours ago",
    ])
    await expect.element(rows.nth(0).getByRole("img", { name: "Text note" })).toBeInTheDocument()

    await rows.nth(1).getByRole("button").click()
    expect(onOpen).toHaveBeenCalledWith("0190a000-0000-7000-8000-00000000000a")
  })

  test("a Checklist row shows what is left to do and how much is done", async () => {
    const noteId = "0190a000-0000-7000-8000-0000000000c1"
    const item = (id: string, text: string, position: string, checkedAt: string | null = null) => ({
      id: `0190a000-0000-7000-8000-00000000010${id}`,
      noteId,
      text,
      position,
      checked: checkedAt !== null,
      checkedAt,
    })
    const { screen } = await renderList(
      [
        note({
          id: noteId,
          kind: "checklist",
          title: "Groceries",
          body: null,
          editedAt: minutesAgo(5),
        }),
      ],
      [
        item("1", "Eggs", "s"),
        item("2", "Milk", "c"),
        item("3", "Jam", "a", minutesAgo(10)),
        item("4", "Bread", "i"),
      ],
    )
    const row = screen.getByRole("listitem")
    await expect.element(row.getByRole("img", { name: "Checklist" })).toBeInTheDocument()
    await expect
      .element(row)
      .toHaveTextContent("GroceriesMilk, Bread, Eggs3 to do · 1 done · 5 minutes ago")
  })

  test("with no Notes, says so", async () => {
    const { screen } = await renderList([])
    await expect.element(screen.getByText("No notes yet")).toBeVisible()
  })
})

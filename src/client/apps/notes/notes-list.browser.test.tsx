import "@/styles.css"
import { useState } from "react"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { NotesList } from "@/apps/notes/notes-list"
import type { Item, Note } from "@/data/notes"
import { instantAt } from "@shared/dates"
import type { NoteTab } from "@shared/notes/notes"
import type { NoteKind } from "@shared/notes/schemas"

const minutesAgo = (minutes: number) => instantAt(Date.now() - minutes * 60_000)

function note(overrides: Partial<Note>): Note {
  return {
    id: "0190a000-0000-7000-8000-000000000000",
    kind: "text",
    title: null,
    body: "",
    creator: { id: "me", name: "Someone" },
    audience: [],
    createdAt: minutesAgo(600),
    editedAt: minutesAgo(600),
    ...overrides,
  }
}

async function renderList(notes: Note[], items: Item[] = []) {
  const onNew = vi.fn<(kind: NoteKind) => void>()
  const onOpen = vi.fn<(id: string) => void>()
  // The tab lives in the URL in the App; here it lives in state, as the home wires it.
  function WithTabs() {
    const [tab, setTab] = useState<NoteTab>("all")
    return (
      <NotesList
        notes={notes}
        items={items}
        viewerId="me"
        tab={tab}
        onTab={setTab}
        onNew={onNew}
        onOpen={onOpen}
      />
    )
  }
  const screen = await render(<WithTabs />)
  return { onNew, onOpen, screen }
}

function rowTexts(screen: Awaited<ReturnType<typeof renderList>>["screen"]) {
  return screen
    .getByRole("listitem")
    .elements()
    .map((row) => row.textContent)
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
      "Call the plumberabout the sinkOnly you · 5 minutes ago",
      "PackingOnly you · 3 hours ago",
    ])
    await expect.element(rows.nth(0).getByRole("img", { name: "Text note" })).toBeInTheDocument()

    await rows.nth(1).getByRole("button").click()
    expect(onOpen).toHaveBeenCalledWith("0190a000-0000-7000-8000-00000000000a")
  })

  test("each row says who the Note is shared with", async () => {
    const ben = { id: "ben", name: "Ben" }
    const cy = { id: "cy", name: "Cy" }
    const { screen } = await renderList([
      note({ id: "0190a000-0000-7000-8000-00000000000a", title: "Private" }),
      note({ id: "0190a000-0000-7000-8000-00000000000b", title: "Mine", audience: [ben, cy] }),
      note({
        id: "0190a000-0000-7000-8000-00000000000c",
        title: "Theirs",
        creator: ben,
        audience: [{ id: "me", name: "Me" }],
      }),
    ])
    const rows = screen.getByRole("listitem")
    await expect.element(rows.nth(0)).toBeVisible()
    expect(rows.elements().map((row) => row.textContent)).toEqual([
      "TheirsBShared by Ben · 10 hours ago",
      "MineShared with Ben, Cy · 10 hours ago",
      "PrivateOnly you · 10 hours ago",
    ])
    // Someone else's Note shows its Creator's avatar.
    await expect.element(rows.nth(0).getByRole("img", { name: "Ben" })).toBeInTheDocument()
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
      .toHaveTextContent("GroceriesMilk, Bread, Eggs3 to do · 1 done · Only you · 5 minutes ago")
  })

  test("with no Notes, says so", async () => {
    const { screen } = await renderList([])
    await expect.element(screen.getByText("No notes yet")).toBeVisible()
  })
})

describe("the tabs", () => {
  const me = { id: "me", name: "Me" }
  const ben = { id: "ben", name: "Ben" }
  const groceries = "GroceriesShared with Ben · 10 minutes ago"
  const wifi = "Wi-FiBShared by Ben · 20 minutes ago"
  const onlyMine = "PrivateOnly you · 30 minutes ago"

  test("All, Mine and Shared with me each hold their Notes, newest edit first", async () => {
    const { screen } = await renderList([
      note({
        id: "0190a000-0000-7000-8000-00000000000a",
        title: "Private",
        editedAt: minutesAgo(30),
      }),
      note({
        id: "0190a000-0000-7000-8000-00000000000b",
        title: "Groceries",
        audience: [ben],
        editedAt: minutesAgo(10),
      }),
      note({
        id: "0190a000-0000-7000-8000-00000000000c",
        title: "Wi-Fi",
        creator: ben,
        audience: [me],
        editedAt: minutesAgo(20),
      }),
    ])
    await expect
      .element(screen.getByRole("tab", { name: "All" }))
      .toHaveAttribute("aria-selected", "true")
    await expect.element(screen.getByText("Wi-Fi")).toBeVisible()
    expect(rowTexts(screen)).toEqual([groceries, wifi, onlyMine])

    await screen.getByRole("tab", { name: "Mine" }).click()
    await expect
      .element(screen.getByRole("tab", { name: "Mine" }))
      .toHaveAttribute("aria-selected", "true")
    await expect.element(screen.getByText("Wi-Fi")).not.toBeInTheDocument()
    expect(rowTexts(screen)).toEqual([groceries, onlyMine])

    await screen.getByRole("tab", { name: "Shared with me" }).click()
    await expect.element(screen.getByText("Private")).not.toBeInTheDocument()
    expect(rowTexts(screen)).toEqual([wifi])

    await screen.getByRole("tab", { name: "All" }).click()
    await expect.element(screen.getByText("Private")).toBeVisible()
    expect(rowTexts(screen)).toEqual([groceries, wifi, onlyMine])
  })

  test("an empty tab says so in its own words", async () => {
    const { screen } = await renderList([
      note({ id: "0190a000-0000-7000-8000-00000000000a", title: "Private" }),
    ])
    await screen.getByRole("tab", { name: "Shared with me" }).click()
    await expect.element(screen.getByText("Nothing shared with you yet")).toBeVisible()
    await expect.element(screen.getByText("Private")).not.toBeInTheDocument()

    await screen.getByRole("tab", { name: "Mine" }).click()
    await expect.element(screen.getByText("Private")).toBeVisible()
  })

  test("Mine with no Notes of the viewer's own says so", async () => {
    const { screen } = await renderList([
      note({
        id: "0190a000-0000-7000-8000-00000000000c",
        title: "Wi-Fi",
        creator: ben,
        audience: [me],
      }),
    ])
    await screen.getByRole("tab", { name: "Mine" }).click()
    await expect.element(screen.getByText("Nothing of yours yet")).toBeVisible()
    await expect.element(screen.getByText("Wi-Fi")).not.toBeInTheDocument()
  })
})

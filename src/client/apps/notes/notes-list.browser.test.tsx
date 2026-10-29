import "@/styles.css"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { NotesList } from "@/apps/notes/notes-list"
import { notesSearch } from "@/apps/notes/notes-search"
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
    audience: [],
    unopened: false,
    createdAt: minutesAgo(600),
    editedAt: minutesAgo(600),
    ...overrides,
  }
}

/** Renders the Notes home at `path`, with the real search params, so the tabs are links. */
async function renderList(notes: Note[], items: Item[] = [], path = "/notes") {
  const onNew = vi.fn<(kind: NoteKind) => void>()
  const onOpen = vi.fn<(id: string) => void>()
  const rootRoute = createRootRoute()
  const notesRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/notes",
    validateSearch: notesSearch,
    component: function NotesRoute() {
      const { tab } = notesRoute.useSearch()
      return (
        <NotesList
          notes={notes}
          items={items}
          viewerId="me"
          tab={tab}
          onNew={onNew}
          onOpen={onOpen}
        />
      )
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([notesRoute]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  const screen = await render(<RouterProvider router={router} />)
  return { onNew, onOpen, screen }
}

/** What each shown Note reads as, top to bottom. */
function shownNotes(screen: Awaited<ReturnType<typeof renderList>>["screen"]) {
  return screen
    .getByRole("listitem")
    .elements()
    .map((element) => element.textContent)
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
    const ben = { id: "ben", name: "Ben", hasAccess: true }
    const cy = { id: "cy", name: "Cy", hasAccess: true }
    const { screen } = await renderList([
      note({ id: "0190a000-0000-7000-8000-00000000000a", title: "Private" }),
      note({ id: "0190a000-0000-7000-8000-00000000000b", title: "Mine", audience: [ben, cy] }),
      note({
        id: "0190a000-0000-7000-8000-00000000000c",
        title: "Theirs",
        creator: ben,
        audience: [{ id: "me", name: "Me", hasAccess: true }],
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

  test("gives an Unopened Note the New badge and puts it first; the viewer's own Notes never are Unopened", async () => {
    const ben = { id: "ben", name: "Ben" }
    const me = { id: "me", name: "Me", hasAccess: true }
    const { screen } = await renderList([
      note({ id: "0190a000-0000-7000-8000-00000000000a", title: "Mine", editedAt: minutesAgo(1) }),
      note({
        id: "0190a000-0000-7000-8000-00000000000b",
        title: "Opened",
        creator: ben,
        audience: [me],
        editedAt: minutesAgo(2),
      }),
      note({
        id: "0190a000-0000-7000-8000-00000000000c",
        title: "Just shared",
        creator: ben,
        audience: [me],
        unopened: true,
        editedAt: minutesAgo(300),
      }),
    ])
    const rows = screen.getByRole("listitem")
    await expect.element(rows.nth(0)).toBeVisible()
    expect(rows.elements().map((row) => row.textContent)).toEqual([
      "Just sharedNewBShared by Ben · 5 hours ago",
      "MineOnly you · 1 minute ago",
      "OpenedBShared by Ben · 2 minutes ago",
    ])
    await expect.element(rows.nth(0).getByText("New", { exact: true })).toBeVisible()
    expect(rows.nth(1).getByText("New", { exact: true }).elements()).toEqual([])
    expect(rows.nth(2).getByText("New", { exact: true }).elements()).toEqual([])
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
      .element(screen.getByRole("link", { name: "All" }))
      .toHaveAttribute("aria-current", "page")
    await expect.element(screen.getByText("Wi-Fi")).toBeVisible()
    expect(shownNotes(screen)).toEqual([groceries, wifi, onlyMine])

    await screen.getByRole("link", { name: "Mine" }).click()
    await expect
      .element(screen.getByRole("link", { name: "Mine" }))
      .toHaveAttribute("aria-current", "page")
    await expect.element(screen.getByText("Wi-Fi")).not.toBeInTheDocument()
    expect(shownNotes(screen)).toEqual([groceries, onlyMine])

    await screen.getByRole("link", { name: "Shared with me" }).click()
    await expect.element(screen.getByText("Private")).not.toBeInTheDocument()
    expect(shownNotes(screen)).toEqual([wifi])

    await screen.getByRole("link", { name: "All" }).click()
    await expect.element(screen.getByText("Private")).toBeVisible()
    expect(shownNotes(screen)).toEqual([groceries, wifi, onlyMine])
  })

  test("an empty tab says so in its own words", async () => {
    const { screen } = await renderList([
      note({ id: "0190a000-0000-7000-8000-00000000000a", title: "Private" }),
    ])
    await screen.getByRole("link", { name: "Shared with me" }).click()
    await expect.element(screen.getByText("Nothing shared with you yet")).toBeVisible()
    await expect.element(screen.getByText("Private")).not.toBeInTheDocument()

    await screen.getByRole("link", { name: "Mine" }).click()
    await expect.element(screen.getByText("Private")).toBeVisible()
  })

  test("an unknown tab in the address falls back to All", async () => {
    const { screen } = await renderList(
      [note({ id: "0190a000-0000-7000-8000-00000000000a", title: "Private" })],
      [],
      "/notes?tab=archived",
    )
    await expect
      .element(screen.getByRole("link", { name: "All" }))
      .toHaveAttribute("aria-current", "page")
    await expect.element(screen.getByText("Private")).toBeVisible()
  })

  test("the address names the tab, so it can be opened straight away", async () => {
    const { screen } = await renderList(
      [note({ id: "0190a000-0000-7000-8000-00000000000a", title: "Private" })],
      [],
      "/notes?tab=shared",
    )
    await expect
      .element(screen.getByRole("link", { name: "Shared with me" }))
      .toHaveAttribute("aria-current", "page")
    await expect.element(screen.getByText("Nothing shared with you yet")).toBeVisible()
    await expect
      .element(screen.getByRole("link", { name: "Mine" }))
      .toHaveAttribute("href", "/notes?tab=mine")
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
    await screen.getByRole("link", { name: "Mine" }).click()
    await expect.element(screen.getByText("You haven't written any notes yet")).toBeVisible()
    await expect.element(screen.getByText("Wi-Fi")).not.toBeInTheDocument()
  })

  test("an Unopened Note has the New badge and comes first in All and Shared with me, never in Mine", async () => {
    const { screen } = await renderList([
      note({
        id: "0190a000-0000-7000-8000-00000000000a",
        title: "Private",
        editedAt: minutesAgo(30),
      }),
      note({
        id: "0190a000-0000-7000-8000-00000000000c",
        title: "Wi-Fi",
        creator: ben,
        audience: [me],
        editedAt: minutesAgo(20),
      }),
      note({
        id: "0190a000-0000-7000-8000-00000000000d",
        title: "Just shared",
        creator: ben,
        audience: [me],
        unopened: true,
        editedAt: minutesAgo(300),
      }),
    ])
    const justShared = "Just sharedNewBShared by Ben · 5 hours ago"
    await expect.element(screen.getByText("Just shared")).toBeVisible()
    expect(shownNotes(screen)).toEqual([justShared, wifi, onlyMine])

    await screen.getByRole("link", { name: "Shared with me" }).click()
    await expect.element(screen.getByText("Private")).not.toBeInTheDocument()
    expect(shownNotes(screen)).toEqual([justShared, wifi])
    await expect
      .element(screen.getByRole("listitem").nth(0).getByText("New", { exact: true }))
      .toBeVisible()

    await screen.getByRole("link", { name: "Mine" }).click()
    await expect.element(screen.getByText("Just shared")).not.toBeInTheDocument()
    expect(shownNotes(screen)).toEqual([onlyMine])
  })
})

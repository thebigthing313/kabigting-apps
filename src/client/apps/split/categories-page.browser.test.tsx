// Managing the shared Categories from Split's Home: the real pages, hooks and collections against a
// fake server that keeps names unique regardless of case, as the real one does.
import "@/styles.css"
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router"
import { QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { AddExpensePage } from "@/apps/split/add-expense-page"
import { CategoriesPage } from "@/apps/split/categories-page"
import { SplitHome } from "@/apps/split/split-home"
import { cleanupCollections } from "@/data/collection-factory"
import { queryClient } from "@/data/query-client"
import type { Category, Expense } from "@/data/split"
import { dismissToasts } from "@/test/toasts"
import { equalSide } from "@shared/split/rules"
import { createCategory, updateCategory } from "@shared/split/schemas"

// Made-up Members, oldest Account first; the viewer is Ana.
const me = { id: "ana", name: "Ana" }
const members = [{ id: "ben", name: "Ben" }, me]
const GROCERIES = "0190a000-0000-7000-8000-000000000001"
const GENERAL = "0190a000-0000-7000-8000-000000000002"

/** What the server holds, and the writes sent to it. */
let categories: Category[] = []
let expenses: Expense[] = []
let writes: { method: string; path: string; body: unknown }[] = []

function conflict(message: string): Response {
  return Response.json({ error: { code: "conflict", message } }, { status: 409 })
}

function taken(name: string, exceptId?: string): boolean {
  return categories.some(
    (category) => category.id !== exceptId && category.name.toLowerCase() === name.toLowerCase(),
  )
}

function serve(path: string, method: string, body: unknown): Response {
  if (method !== "GET") writes.push({ method, path, body })
  if (path === "/api/split/members") return Response.json({ rows: members })
  if (path === "/api/split/expenses" && method === "GET") return Response.json({ rows: expenses })
  if (path === "/api/split/categories" && method === "GET") {
    return Response.json({ rows: categories })
  }
  if (path === "/api/split/categories" && method === "POST") {
    const input = createCategory.parse(body)
    if (taken(input.name)) return conflict(`A Category named "${input.name}" already exists`)
    const stored = { ...input, archived: false }
    categories = [...categories, stored]
    return Response.json(stored, { status: 201 })
  }
  const id = /^\/api\/split\/categories\/([^/]+)$/.exec(path)?.[1]
  const existing = categories.find((category) => category.id === id)
  if (existing && method === "PATCH") {
    const changes = updateCategory.parse(body)
    if (changes.name !== undefined && taken(changes.name, existing.id)) {
      return conflict(`A Category named "${changes.name}" already exists`)
    }
    const stored = { ...existing, ...changes }
    categories = categories.map((category) => (category.id === stored.id ? stored : category))
    return Response.json(stored)
  }
  return Response.json({ error: { code: "not_found", message: "No such route" } }, { status: 404 })
}

beforeEach(() => {
  categories = [
    { id: GROCERIES, name: "Groceries", archived: false },
    { id: GENERAL, name: "General", archived: false },
  ]
  expenses = []
  writes = []
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = ((input instanceof Request ? input.method : init?.method) ?? "GET").toUpperCase()
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null
    return serve(url.pathname, method, body)
  })
})

afterEach(async () => {
  dismissToasts()
  await cleanup()
  await cleanupCollections()
  queryClient.clear()
  vi.unstubAllGlobals()
})

async function openSplit(path: string) {
  const rootRoute = createRootRoute()
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_app",
    beforeLoad: () => ({ session: { user: me }, apps: ["split"] }),
  })
  const splitRoute = createRoute({ getParentRoute: () => appRoute, path: "/split" })
  const routes = [
    createRoute({ getParentRoute: () => splitRoute, path: "/", component: SplitHome }),
    createRoute({
      getParentRoute: () => splitRoute,
      path: "/expenses/new",
      component: AddExpensePage,
    }),
    createRoute({
      getParentRoute: () => splitRoute,
      path: "/categories",
      component: CategoriesPage,
    }),
  ]
  const router = createRouter({
    routeTree: rootRoute.addChildren([appRoute.addChildren([splitRoute.addChildren(routes)])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  await router.load()
  const screen = await render(
    <>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
      <Toaster />
    </>,
  )
  return { screen, router }
}

describe("Managing Categories", () => {
  test("add, rename and archive; an archived Category leaves the chips but stays on its Expenses", async () => {
    expenses = [
      {
        id: "0190a000-0000-7000-8000-000000000100",
        description: "Weekly shop",
        date: "2026-10-30",
        categoryId: GROCERIES,
        total: 4_000,
        note: "",
        paid: equalSide(["ana"]),
        owed: equalSide(["ben", "ana"]),
        paidShares: { ana: 4_000 },
        owedShares: { ben: 2_000, ana: 2_000 },
        addedBy: "ana",
        addedAt: "2026-10-30T12:00:00.000Z",
        changedBy: "ana",
        changedAt: "2026-10-30T12:00:00.000Z",
      },
    ]
    const { screen, router } = await openSplit("/split")
    await screen.getByRole("button", { name: "Categories" }).click()
    await expect.element(screen.getByRole("heading", { name: "Categories" })).toBeVisible()
    const inUse = screen.getByRole("region", { name: "In use" })
    const archived = screen.getByRole("region", { name: "Archived" })
    await expect
      .element(inUse)
      .toHaveTextContent("In useGeneralRenameArchiveGroceriesRenameArchive")
    await expect.element(archived).toHaveTextContent("ArchivedNone archived")

    await screen.getByRole("button", { name: "Add" }).click()
    await screen.getByRole("textbox", { name: "Name" }).fill("  Board games ")
    await screen.getByRole("button", { name: "Save" }).click()
    await expect.element(inUse.getByText("Board games")).toBeVisible()

    await screen.getByRole("button", { name: "Rename Board games" }).click()
    await screen.getByRole("textbox", { name: "Name" }).fill("Card games")
    await screen.getByRole("button", { name: "Save" }).click()
    await expect.element(inUse.getByText("Card games")).toBeVisible()

    await screen.getByRole("button", { name: "Archive Groceries" }).click()
    await expect.element(archived).toHaveTextContent("ArchivedGroceriesRenameUnarchive")
    await expect
      .element(inUse)
      .toHaveTextContent("In useCard gamesRenameArchiveGeneralRenameArchive")

    const added = categories.find((category) => category.name === "Card games")
    if (!added) throw new Error("Card games was not stored")
    expect(writes).toEqual([
      {
        method: "POST",
        path: "/api/split/categories",
        body: { id: added.id, name: "Board games" },
      },
      {
        method: "PATCH",
        path: `/api/split/categories/${added.id}`,
        body: { name: "Card games" },
      },
      { method: "PATCH", path: `/api/split/categories/${GROCERIES}`, body: { archived: true } },
    ])

    // The old Expense keeps its Category; a new one isn't offered it.
    await screen.getByRole("button", { name: "Back" }).click()
    await expect.element(screen.getByText("Oct 30, 2026 · Groceries")).toBeVisible()
    await screen.getByRole("button", { name: "Add Expense" }).click()
    const chips = screen.getByRole("radiogroup", { name: "Category" })
    await expect.element(chips).toHaveTextContent("Card gamesGeneral")
    await expect.element(screen.getByRole("radio", { name: "General" })).toBeChecked()
    expect(router.state.location.pathname).toBe("/split/expenses/new")
  })

  test("an archived Category can be put back in use", async () => {
    categories = [{ id: GROCERIES, name: "Groceries", archived: true }]
    const { screen } = await openSplit("/split/categories")
    await expect
      .element(screen.getByRole("region", { name: "In use" }))
      .toHaveTextContent("In useNo Categories in use")
    await screen.getByRole("button", { name: "Unarchive Groceries" }).click()
    await expect
      .element(screen.getByRole("region", { name: "In use" }))
      .toHaveTextContent("In useGroceriesRenameArchive")
    expect(categories).toEqual([{ id: GROCERIES, name: "Groceries", archived: false }])
  })

  test("a name already in the list, in any case, is caught before it is sent", async () => {
    const { screen } = await openSplit("/split/categories")
    await screen.getByRole("button", { name: "Add" }).click()
    await screen.getByRole("textbox", { name: "Name" }).fill("GROCERIES")
    await screen.getByRole("button", { name: "Save" }).click()
    await expect.element(screen.getByText('"GROCERIES" is already used')).toBeVisible()
    expect(writes).toEqual([])
  })

  test("a name another Member just took is refused by the server and rolled back", async () => {
    const { screen } = await openSplit("/split/categories")
    await expect.element(screen.getByText("General")).toBeVisible()
    // Ben adds it after this page loaded.
    categories = [
      ...categories,
      { id: "0190a000-0000-7000-8000-000000000003", name: "Pets", archived: false },
    ]

    await screen.getByRole("button", { name: "Add" }).click()
    await screen.getByRole("textbox", { name: "Name" }).fill("pets")
    await screen.getByRole("button", { name: "Save" }).click()
    await expect.element(screen.getByText('A Category named "pets" already exists')).toBeVisible()
    await expect
      .element(screen.getByRole("region", { name: "In use" }))
      .toHaveTextContent("In useGeneralRenameArchiveGroceriesRenameArchive")
  })
})

// Adding an Expense from Split's Home and seeing the Balance move: the real pages, hooks and
// collection against a fake server that works out shares the way the real one does.
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
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { cleanup, render } from "vitest-browser-react"
import { AddExpensePage } from "@/apps/split/add-expense-page"
import { SplitHome } from "@/apps/split/split-home"
import { cleanupCollections } from "@/data/collection-factory"
import type { Expense } from "@/data/split"
import { queryClient } from "@/data/query-client"
import { dismissToasts } from "@/test/toasts"
import { newExpenseRoster, resolveExpense } from "@shared/split/rules"
import { createExpense } from "@shared/split/schemas"

// Made-up Members, oldest Account first; the viewer is Ana.
const me = { id: "ana", name: "Ana", standing: "member" }
const members = [
  { id: "ben", name: "Ben", standing: "member" },
  me,
  { id: "cy", name: "Cy", standing: "member" },
]
const GENERAL = "0190a000-0000-7000-8000-000000000002"
const categories = [
  { id: "0190a000-0000-7000-8000-000000000001", name: "Groceries", archived: false },
  { id: GENERAL, name: "General", archived: false },
]
const ADDED_AT = "2026-10-31T16:00:00.000Z"

/** What the server holds, and the Expenses posted to it. */
let expenses: Expense[] = []
let posted: unknown[] = []

function serve(path: string, method: string, body: unknown): Response {
  if (path === "/api/split/members") return Response.json({ rows: members })
  if (path === "/api/split/categories") return Response.json({ rows: categories })
  if (path === "/api/split/expenses" && method === "GET") return Response.json({ rows: expenses })
  if (path === "/api/split/expenses" && method === "POST") {
    posted.push(body)
    const input = createExpense.parse(body)
    const resolved = resolveExpense(input, newExpenseRoster(members.map((member) => member.id)))
    if (!resolved.ok) {
      return Response.json(
        { error: { code: "validation_failed", message: "Not valid" } },
        { status: 400 },
      )
    }
    const stored: Expense = {
      ...input,
      paidShares: resolved.paidShares,
      owedShares: resolved.owedShares,
      addedBy: me.id,
      addedAt: ADDED_AT,
      changedBy: me.id,
      changedAt: ADDED_AT,
    }
    expenses = [...expenses, stored]
    return Response.json(stored, { status: 201 })
  }
  return Response.json({ error: { code: "not_found", message: "No such route" } }, { status: 404 })
}

beforeEach(() => {
  expenses = []
  posted = []
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

async function openSplit() {
  const rootRoute = createRootRoute()
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_app",
    beforeLoad: () => ({ session: { user: me }, apps: ["split"] }),
  })
  const splitRoute = createRoute({ getParentRoute: () => appRoute, path: "/split" })
  const homeRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/",
    component: SplitHome,
  })
  const newRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/expenses/new",
    component: AddExpensePage,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      appRoute.addChildren([splitRoute.addChildren([homeRoute, newRoute])]),
    ]),
    history: createMemoryHistory({ initialEntries: ["/split"] }),
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

test("an equal Expense added in a few taps moves everyone's Balance", async () => {
  const { screen, router } = await openSplit()
  const balance = screen.getByRole("region", { name: "Your Balance" })
  await expect
    .element(balance)
    .toHaveTextContent("Your Balance$0.00You're settled upBen is settled upCy is settled up")

  await screen.getByRole("button", { name: "Add Expense" }).click()
  await expect.element(screen.getByRole("heading", { name: "New Expense" })).toBeVisible()
  await screen.getByRole("textbox", { name: "Total" }).fill("90.01")
  await screen.getByRole("textbox", { name: "Description" }).fill("Groceries run")
  await screen.getByRole("button", { name: "Next" }).click()
  await screen.getByRole("button", { name: "Next" }).click()
  await screen.getByRole("button", { name: "Next" }).click()
  await screen.getByRole("button", { name: "Add Expense" }).click()

  // Back on Home, with the server's shares: the leftover cent went to Ben, the oldest Account.
  await expect.element(screen.getByText("Groceries run")).toBeVisible()
  expect(router.state.location.pathname).toBe("/split")
  await expect
    .element(balance)
    .toHaveTextContent("Your Balance+$60.01The others owe youBen owes $30.01Cy owes $30.00")
  await expect.element(screen.getByText("Your Balance +$60.01")).toBeVisible()
  expect(posted).toEqual([
    expect.objectContaining({
      description: "Groceries run",
      categoryId: GENERAL,
      total: 9_001,
      paid: expect.objectContaining({ mode: "equal", ticked: ["ana"] }),
      owed: expect.objectContaining({ mode: "equal", ticked: ["ben", "ana", "cy"] }),
    }),
  ])
})

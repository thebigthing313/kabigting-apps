// Changing and deleting a saved Expense: the flow on its own, then from Split's Home with the real
// pages, hooks and collection against a fake server that works out shares the way the real one
// does.
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
import { EditExpensePage } from "@/apps/split/edit-expense-page"
import { ExpenseFlow, type NewExpense } from "@/apps/split/expense-flow"
import { SplitHome } from "@/apps/split/split-home"
import { cleanupCollections } from "@/data/collection-factory"
import { queryClient } from "@/data/query-client"
import type { Expense } from "@/data/split"
import { dismissToasts } from "@/test/toasts"
import { editExpenseRoster, equalSide, resolveExpense } from "@shared/split/rules"
import { updateExpense, type Side } from "@shared/split/schemas"

// Made-up Members, oldest Account first; the viewer is Ana. Dee once was a Member.
const me = { id: "ana", name: "Ana", former: false }
const members = [
  { id: "ben", name: "Ben", former: false },
  me,
  { id: "cy", name: "Cy", former: false },
]
const memberIds = members.map((member) => member.id)
const GROCERIES = "0190a000-0000-7000-8000-000000000001"
const GENERAL = "0190a000-0000-7000-8000-000000000002"
const ARCHIVED = "0190a000-0000-7000-8000-000000000003"
const categories = [
  { id: GROCERIES, name: "Groceries", archived: false },
  { id: GENERAL, name: "General", archived: false },
  { id: ARCHIVED, name: "Old stuff", archived: true },
]
const EXPENSE_ID = "0190a000-0000-7000-8000-000000000100"
const ADDED_AT = "2026-10-03T16:00:00.000Z"
const CHANGED_AT = "2026-10-05T16:00:00.000Z"

/** Ben paid $90.00 for groceries, which everyone owes equally; Ben added it on Oct 3. */
function saved(overrides: Partial<Expense> = {}): Expense {
  return {
    id: EXPENSE_ID,
    description: "Groceries run",
    date: "2026-10-03",
    categoryId: GROCERIES,
    total: 9_000,
    note: "Paid at the till",
    paid: equalSide(["ben"]),
    owed: equalSide(["ben", "ana", "cy"]),
    paidShares: { ben: 9_000 },
    owedShares: { ben: 3_000, ana: 3_000, cy: 3_000 },
    addedBy: "ben",
    addedAt: ADDED_AT,
    changedBy: "ben",
    changedAt: ADDED_AT,
    ...overrides,
  }
}

async function renderEdit(expense: Expense) {
  const onSave = vi.fn<(expense: NewExpense) => Promise<boolean>>(async () => true)
  const onCancel = vi.fn<() => void>()
  const onDelete = vi.fn<() => void>()
  const screen = await render(
    <ExpenseFlow
      viewerId="ana"
      members={members}
      categories={categories}
      today="2026-10-31"
      onSave={onSave}
      onCancel={onCancel}
      editing={{ expense, onDelete }}
    />,
  )
  return { screen, onSave, onCancel, onDelete }
}

describe("the flow, changing a saved Expense", () => {
  test("opens on Review with the sides it was saved with, even ones no one-tap answer gives", async () => {
    // Dee, who has since lost access, paid with Ben; only Ben and Cy owe.
    const expense = saved({
      total: 1_001,
      paid: equalSide(["dee", "ben"]),
      owed: equalSide(["cy", "ben"]),
      paidShares: { dee: 501, ben: 500 },
      owedShares: { ben: 501, cy: 500 },
      changedBy: "ana",
      changedAt: CHANGED_AT,
    })
    const { screen, onSave } = await renderEdit(expense)
    await expect.element(screen.getByRole("heading", { name: "Edit Expense" })).toBeVisible()
    await expect.element(screen.getByText("Ben paid $5.01; Someone paid $5.00")).toBeVisible()
    await expect.element(screen.getByText("Ben owes $5.01; Cy owes $5.00")).toBeVisible()
    await expect
      .element(screen.getByText("Added by Ben on Oct 3 · changed by you on Oct 5"))
      .toBeVisible()

    // No one-tap answer matches, so the side reopens in the full editor, as it was entered.
    await screen.getByRole("button", { name: "Change Owed" }).click()
    const owed = screen.getByRole("radiogroup", { name: "Who owes for it?" }).getByRole("radio")
    await expect.element(owed.getByText("Split it differently")).toBeVisible()
    expect(owed.elements().map((answer) => answer.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "false",
      "false",
      "true",
    ])
    await expect.element(screen.getByRole("checkbox", { name: "You" })).not.toBeChecked()
    await expect.element(screen.getByRole("checkbox", { name: "Ben" })).toBeChecked()
    await expect.element(screen.getByRole("checkbox", { name: "Cy" })).toBeChecked()
    await screen.getByRole("button", { name: "Done" }).click()

    await screen.getByRole("button", { name: "Save changes" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      description: "Groceries run",
      date: "2026-10-03",
      categoryId: GROCERIES,
      total: 1_001,
      note: "Paid at the till",
      paid: equalSide(["dee", "ben"]),
      owed: equalSide(["cy", "ben"]),
    })
  })

  test("a saved Exact or Percent side reopens in the editor, a Refund's amounts without a minus", async () => {
    const paid: Side = {
      mode: "exact",
      ticked: [],
      exact: { ana: 1_000, ben: 2_000 },
      percent: {},
    }
    const owed: Side = {
      mode: "percent",
      ticked: [],
      exact: {},
      percent: { ben: "50", ana: "25", cy: "25" },
    }
    const { screen, onSave } = await renderEdit(
      saved({
        description: "Returned a lamp",
        total: -3_000,
        paid,
        owed,
        paidShares: { ana: -1_000, ben: -2_000 },
        owedShares: { ben: -1_500, ana: -750, cy: -750 },
      }),
    )
    await expect.element(screen.getByText("-$30.00 (Refund)")).toBeVisible()
    await expect.element(screen.getByText("You got back $10.00; Ben got back $20.00")).toBeVisible()
    await expect
      .element(screen.getByText("You and Cy share $7.50 each; Ben shares $15.00"))
      .toBeVisible()

    await screen.getByRole("button", { name: "Change Paid" }).click()
    await expect
      .element(screen.getByRole("radio", { name: "Several people got it back" }))
      .toBeChecked()
    await expect.element(screen.getByRole("radio", { name: "Exact $" })).toBeChecked()
    const amountFor = (name: string) => screen.getByRole("textbox", { name: `Amount for ${name}` })
    await expect.element(amountFor("you")).toHaveValue("$10.00")
    await expect.element(amountFor("Ben")).toHaveValue("$20.00")
    await expect.element(amountFor("Cy")).toHaveValue("")
    const tally = screen.getByRole("status", { name: "Tally" })
    await expect.element(tally).toHaveTextContent("2 ways")
    await amountFor("you").fill("5")
    await expect.element(tally).toHaveTextContent("$5.00 left to assign")
    await expect.element(screen.getByRole("button", { name: "Done" })).toBeDisabled()
    await amountFor("Cy").fill("5")
    await expect.element(tally).toHaveTextContent("3 ways")
    await screen.getByRole("button", { name: "Done" }).click()

    await screen.getByRole("button", { name: "Change Owed" }).click()
    await expect.element(screen.getByRole("radio", { name: "Split it differently" })).toBeChecked()
    await expect.element(screen.getByRole("radio", { name: "Percent" })).toBeChecked()
    await expect.element(screen.getByRole("textbox", { name: "Percent for Ben" })).toHaveValue("50")
    await screen.getByRole("button", { name: "Done" }).click()

    await screen.getByRole("button", { name: "Save changes" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        total: -3_000,
        paid: { ...paid, exact: { ana: 500, ben: 2_000, cy: 500 } },
        owed,
      }),
    )
  })

  test("each step returns to Review, and Review's back arrow leaves", async () => {
    const { screen, onCancel } = await renderEdit(saved())
    await screen.getByRole("button", { name: "Change What" }).click()
    await screen.getByRole("textbox", { name: "Total" }).fill("120.00")
    await screen.getByRole("button", { name: "Done" }).click()
    await expect.element(screen.getByText("Ben paid $120.00")).toBeVisible()

    await screen
      .getByRole("navigation", { name: "Steps" })
      .getByRole("button", {
        name: "Who paid",
      })
      .click()
    await screen.getByRole("radio", { name: "You paid it all" }).click()
    await screen.getByRole("button", { name: "Back" }).click()
    await expect.element(screen.getByText("You paid $120.00")).toBeVisible()

    await screen.getByRole("button", { name: "Cancel" }).click()
    expect(onCancel).toHaveBeenCalled()
  })

  test("deleting takes a second tap", async () => {
    const { screen, onDelete } = await renderEdit(saved())
    await screen.getByRole("button", { name: "Delete Expense" }).click()
    expect(onDelete).not.toHaveBeenCalled()
    await screen.getByRole("button", { name: "Tap again to delete for good" }).click()
    expect(onDelete).toHaveBeenCalledOnce()
  })

  test("leaving Review disarms the delete", async () => {
    const { screen } = await renderEdit(saved())
    await screen.getByRole("button", { name: "Delete Expense" }).click()
    await screen.getByRole("button", { name: "Change What" }).click()
    await screen.getByRole("button", { name: "Done" }).click()
    await expect.element(screen.getByRole("button", { name: "Delete Expense" })).toBeVisible()
  })
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
  const editRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/expenses/$expenseId",
    component: function EditRoute() {
      return <EditExpensePage expenseId={editRoute.useParams().expenseId} />
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      appRoute.addChildren([splitRoute.addChildren([homeRoute, editRoute])]),
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

describe("from Split's Home", () => {
  /** What the server holds, and the requests that changed it. */
  let expenses: Expense[] = []
  let writes: { method: string; path: string; body: unknown }[] = []
  /** A write the server refuses this time, with its answer. */
  let refusing: { method: string; answer: () => Response } | null = null

  function serve(path: string, method: string, body: unknown): Response {
    if (path === "/api/split/members") return Response.json({ rows: members })
    if (path === "/api/split/categories") return Response.json({ rows: categories })
    if (path === "/api/split/expenses" && method === "GET") return Response.json({ rows: expenses })
    const id = path.replace("/api/split/expenses/", "")
    const found = expenses.find((expense) => expense.id === id)
    if (found && refusing?.method === method) {
      writes.push({ method, path, body })
      return refusing.answer()
    }
    if (found && method === "PUT") {
      writes.push({ method, path, body })
      const input = updateExpense.parse(body)
      const resolved = resolveExpense(input, editExpenseRoster(memberIds, memberIds, found))
      if (!resolved.ok) {
        return Response.json(
          { error: { code: "validation_failed", message: "Not valid" } },
          { status: 400 },
        )
      }
      const stored: Expense = {
        ...found,
        ...input,
        paidShares: resolved.paidShares,
        owedShares: resolved.owedShares,
        changedBy: me.id,
        changedAt: CHANGED_AT,
      }
      expenses = expenses.map((expense) => (expense.id === id ? stored : expense))
      return Response.json(stored)
    }
    if (found && method === "DELETE") {
      writes.push({ method, path, body })
      expenses = expenses.filter((expense) => expense.id !== id)
      return Response.json(found)
    }
    return Response.json(
      { error: { code: "not_found", message: "No such Expense" } },
      { status: 404 },
    )
  }

  beforeEach(() => {
    expenses = [saved()]
    writes = []
    refusing = null
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
      const method = (
        (input instanceof Request ? input.method : init?.method) ?? "GET"
      ).toUpperCase()
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

  test("tapping a card opens it on Review, and saving replaces it and moves the Balances", async () => {
    const { screen, router } = await openSplit()
    const balance = screen.getByRole("region", { name: "Your Balance" })
    await expect
      .element(balance)
      .toHaveTextContent("Your Balance-$30.00You owe the othersBen is owed $60.00Cy owes $30.00")

    await screen.getByRole("button", { name: "Edit Groceries run" }).click()
    await expect.element(screen.getByRole("heading", { name: "Edit Expense" })).toBeVisible()
    expect(router.state.location.pathname).toBe(`/split/expenses/${EXPENSE_ID}`)
    await expect.element(screen.getByText("Added by Ben on Oct 3")).toBeVisible()

    await screen.getByRole("button", { name: "Change Owed" }).click()
    await screen.getByRole("radio", { name: "Only Cy" }).click()
    await screen.getByRole("button", { name: "Done" }).click()
    await screen.getByRole("button", { name: "Save changes" }).click()

    // Back on Home: Cy now owes Ben all of it, which doesn't involve the viewer.
    await expect
      .element(balance)
      .toHaveTextContent("Your Balance$0.00You're settled upBen is owed $90.00Cy owes $90.00")
    expect(router.state.location.pathname).toBe("/split")
    await expect
      .element(screen.getByText("Added by Ben on Oct 3 · changed by you on Oct 5"))
      .toBeVisible()
    expect(writes).toEqual([
      {
        method: "PUT",
        path: `/api/split/expenses/${EXPENSE_ID}`,
        body: {
          description: "Groceries run",
          date: "2026-10-03",
          categoryId: GROCERIES,
          total: 9_000,
          note: "Paid at the till",
          paid: equalSide(["ben"]),
          owed: equalSide(["cy"]),
        },
      },
    ])
  })

  test("an archived Category is offered only on the Expense that already has it", async () => {
    expenses = [saved({ categoryId: ARCHIVED })]
    const { screen } = await openSplit()
    await screen.getByRole("button", { name: "Edit Groceries run" }).click()
    await screen.getByRole("button", { name: "Change What" }).click()
    const chips = screen.getByRole("radiogroup", { name: "Category" }).getByRole("radio")
    await expect.element(screen.getByRole("radio", { name: "Old stuff" })).toBeChecked()
    expect(chips.elements().map((chip) => chip.textContent)).toContain("Old stuff")
    await screen.getByRole("radio", { name: "General" }).click()
    await expect.element(screen.getByRole("radio", { name: "Old stuff" })).not.toBeChecked()
  })

  test("a second tap deletes it for good, and the Balances move at once", async () => {
    const { screen, router } = await openSplit()
    await screen.getByRole("button", { name: "Edit Groceries run" }).click()
    await screen.getByRole("button", { name: "Delete Expense" }).click()
    expect(writes).toEqual([])
    await screen.getByRole("button", { name: "Tap again to delete for good" }).click()

    await expect
      .element(screen.getByText("Nothing yet. Add an Expense or settle up to start."))
      .toBeVisible()
    expect(router.state.location.pathname).toBe("/split")
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance$0.00You're settled upBen is settled upCy is settled up")
    await vi.waitFor(() =>
      expect(writes).toEqual([
        { method: "DELETE", path: `/api/split/expenses/${EXPENSE_ID}`, body: null },
      ]),
    )
  })

  test("a save only the server refuses rolls back, and the form stays open", async () => {
    // Say Cy lost App access after the form opened: only the server can tell.
    refusing = {
      method: "PUT",
      answer: () =>
        Response.json(
          {
            error: {
              code: "validation_failed",
              message: "The Expense is not valid",
              details: [{ path: "owed", message: "Only Members can be on an Expense" }],
            },
          },
          { status: 400 },
        ),
    }
    const { screen, router } = await openSplit()
    await screen.getByRole("button", { name: "Edit Groceries run" }).click()
    await screen.getByRole("button", { name: "Change Owed" }).click()
    await screen.getByRole("radio", { name: "Only Cy" }).click()
    await screen.getByRole("button", { name: "Done" }).click()
    await screen.getByRole("button", { name: "Save changes" }).click()

    // Still on Review with the draft, and the button is back for another try.
    await expect.element(screen.getByRole("button", { name: "Save changes" })).toBeEnabled()
    expect(router.state.location.pathname).toBe(`/split/expenses/${EXPENSE_ID}`)
    await expect.element(screen.getByText("Cy owes $90.00")).toBeVisible()
    expect(writes).toHaveLength(1)

    // The Expense itself is as it was.
    await screen.getByRole("button", { name: "Cancel" }).click()
    await expect.element(screen.getByText("You, Ben and Cy owe $30.00 each")).toBeVisible()
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance-$30.00You owe the othersBen is owed $60.00Cy owes $30.00")
  })

  test("a delete that fails brings the Expense back", async () => {
    refusing = {
      method: "DELETE",
      answer: () =>
        Response.json(
          { error: { code: "internal", message: "Something went wrong" } },
          { status: 500 },
        ),
    }
    const { screen } = await openSplit()
    await screen.getByRole("button", { name: "Edit Groceries run" }).click()
    await screen.getByRole("button", { name: "Delete Expense" }).click()
    await screen.getByRole("button", { name: "Tap again to delete for good" }).click()

    await vi.waitFor(() => expect(writes).toHaveLength(1))
    await expect.element(screen.getByText("You, Ben and Cy owe $30.00 each")).toBeVisible()
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance-$30.00You owe the othersBen is owed $60.00Cy owes $30.00")
  })
})

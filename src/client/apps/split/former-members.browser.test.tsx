// Former members on the client: listed on Home, named in words, offered on Settle up, shown in an
// edited Expense's editor only on the side they are already on, and flagged when someone loses
// App access while an Expense is being added.
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
import { ExpenseFlow, type NewExpense } from "@/apps/split/expense-flow"
import { HomeView } from "@/apps/split/home-view"
import { PaymentForm, type NewPayment } from "@/apps/split/payment-form"
import { cleanupCollections } from "@/data/collection-factory"
import { queryClient } from "@/data/query-client"
import type { EntryOutcome, Expense, Member } from "@/data/split"
import { dismissToasts } from "@/test/toasts"
import { equalSide, memberIdsOf, newExpenseRoster, resolveExpense } from "@shared/split/rules"
import { createExpense } from "@shared/split/schemas"

// Made-up Accounts, oldest first; the viewer is Ana. Dee, the oldest, lost App access; Gus lost
// it too, having only added an entry.
const dee: Member = { id: "dee", name: "Dee", standing: "former" }
const me: Member = { id: "ana", name: "Ana", standing: "member" }
const accounts: Member[] = [
  dee,
  { id: "ben", name: "Ben", standing: "member" },
  me,
  { id: "cy", name: "Cy", standing: "member" },
  { id: "gus", name: "Gus", standing: "author" },
]
const GENERAL = "0190a000-0000-7000-8000-000000000002"
const categories = [{ id: GENERAL, name: "General", archived: false }]
const ADDED_AT = "2026-10-03T16:00:00.000Z"

/** Dee paid $90.00 that Dee, Ben and Ana owe equally; Dee added it. */
const lunch: Expense = {
  id: "0190a000-0000-7000-8000-000000000100",
  description: "Lunch",
  date: "2026-10-03",
  categoryId: GENERAL,
  total: 9_000,
  note: "",
  paid: equalSide(["dee"]),
  owed: equalSide(["dee", "ben", "ana"]),
  paidShares: { dee: 9_000 },
  owedShares: { dee: 3_000, ben: 3_000, ana: 3_000 },
  addedBy: "dee",
  addedAt: ADDED_AT,
  changedBy: "dee",
  changedAt: ADDED_AT,
}

afterEach(async () => {
  dismissToasts()
  await cleanup()
})

async function renderFlow(editing?: Expense) {
  const onSave = vi.fn<(expense: NewExpense) => Promise<EntryOutcome>>(async () => "saved")
  const screen = await render(
    <ExpenseFlow
      viewerId="ana"
      members={accounts}
      categories={categories}
      today="2026-10-31"
      onSave={onSave}
      onCancel={() => {}}
      editing={editing && { expense: editing, onDelete: () => {} }}
    />,
  )
  return { screen, onSave }
}

describe("a new Expense", () => {
  test("never offers a Former member, as a one-tap answer or in the editor", async () => {
    const { screen } = await renderFlow()
    await screen.getByRole("textbox", { name: "Total" }).fill("90")
    await screen.getByRole("textbox", { name: "Description" }).fill("Pizza")
    await screen.getByRole("button", { name: "Next" }).click()

    const paid = screen.getByRole("radiogroup", { name: "Who paid?" })
    await expect.element(paid).toBeVisible()
    expect(paid.getByText("Dee paid it all").elements()).toEqual([])
    await paid.getByRole("radio", { name: "Several people paid" }).click()
    await expect.element(screen.getByRole("checkbox", { name: "Ben" })).toBeVisible()
    expect(screen.getByRole("checkbox", { name: "Dee" }).elements()).toEqual([])

    await screen.getByRole("button", { name: "Next" }).click()
    const owed = screen.getByRole("radiogroup", { name: "Who owes for it?" })
    expect(owed.getByText("Only Dee").elements()).toEqual([])
    await screen.getByRole("button", { name: "Next" }).click()
    // Everyone equally is the Members alone.
    await expect.element(screen.getByText("You, Ben and Cy owe $30.00 each")).toBeVisible()
  })
})

describe("an edited Expense", () => {
  test("names a Former member, and shows them only on the side they are on", async () => {
    const { screen, onSave } = await renderFlow(lunch)
    await expect.element(screen.getByText("Dee paid $90.00")).toBeVisible()
    await expect.element(screen.getByText("You, Dee and Ben owe $30.00 each")).toBeVisible()
    await expect.element(screen.getByText("Added by Dee on Oct 3")).toBeVisible()

    // Dee owes, so the owed side opens in the editor with a row for her, marked.
    await screen.getByRole("button", { name: "Change Owed" }).click()
    const editor = screen.getByRole("region", { name: "Owed side" })
    await expect.element(editor.getByRole("checkbox", { name: "Dee" })).toBeChecked()
    await expect.element(editor.getByText("Former member")).toBeVisible()
    // Her share can be changed, or she can be taken off.
    await editor.getByRole("radio", { name: "Exact $" }).click()
    await expect
      .element(editor.getByRole("textbox", { name: "Amount for Dee" }))
      .toHaveValue("$30.00")
    await editor.getByRole("radio", { name: "Equally" }).click()
    await editor.getByRole("checkbox", { name: "Dee" }).click()
    await expect.element(editor.getByRole("checkbox", { name: "Dee" })).not.toBeChecked()
    await screen.getByRole("button", { name: "Done" }).click()
    await expect.element(screen.getByText("You and Ben owe $45.00 each")).toBeVisible()

    // She is still on the paid side; switching it away loses her, and she can't come back.
    await screen.getByRole("button", { name: "Change Paid" }).click()
    const paid = screen.getByRole("radiogroup", { name: "Who paid?" })
    await expect.element(paid.getByRole("radio", { name: "Several people paid" })).toBeChecked()
    await expect
      .element(
        screen.getByRole("region", { name: "Paid side" }).getByRole("checkbox", { name: "Dee" }),
      )
      .toBeChecked()
    await screen.getByRole("button", { name: "Done" }).click()

    await screen.getByRole("button", { name: "Save changes" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        paid: lunch.paid,
        owed: expect.objectContaining({ mode: "equal", ticked: ["ben", "ana"] }),
      }),
    )
  })

  test("a Former member on one side has no row on the other", async () => {
    const { screen } = await renderFlow({
      ...lunch,
      paid: equalSide(["ben"]),
      paidShares: { ben: 9_000 },
    })
    await screen.getByRole("button", { name: "Change Paid" }).click()
    await screen.getByRole("radio", { name: "Several people paid" }).click()
    const editor = screen.getByRole("region", { name: "Paid side" })
    await expect.element(editor.getByRole("checkbox", { name: "Ben" })).toBeChecked()
    expect(editor.getByRole("checkbox", { name: "Dee" }).elements()).toEqual([])
  })
})

describe("Home", () => {
  test("lists a Former member's Balance, even at zero, but not someone who only added an entry", async () => {
    const screen = await render(
      <HomeView
        viewerId="ana"
        members={[...accounts, { id: "eve", name: "Eve", standing: "former" }]}
        expenses={[lunch]}
        payments={[]}
        categories={categories}
        tab="activity"
        onTabChange={() => {}}
        onAddExpense={() => {}}
        onSettleUp={() => {}}
        onOpenExpense={() => {}}
        onOpenPayment={() => {}}
        onManageCategories={() => {}}
      />,
    )
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent(
        "Your Balance-$30.00You owe the othersDee is owed $60.00 · Former memberBen owes $30.00" +
          "Cy is settled upEve is settled up · Former member",
      )
  })
})

describe("Settle up", () => {
  test("offers a Former member's tile, and records a Payment to them", async () => {
    const onSave = vi.fn<(payment: NewPayment) => Promise<EntryOutcome>>(async () => "saved")
    const screen = await render(
      <PaymentForm
        viewerId="ana"
        members={accounts}
        balances={{ dee: 6_000, ben: -3_000, ana: -3_000, cy: 0 }}
        today="2026-10-31"
        onSave={onSave}
        onCancel={() => {}}
      />,
    )
    const getting = screen.getByRole("radiogroup", { name: "Who gets it?" })
    // A new Payment still starts with the oldest other Member, not a Former member.
    await expect.element(getting.getByRole("radio", { name: "Ben" })).toBeChecked()
    expect(getting.getByRole("radio", { name: "Gus" }).elements()).toEqual([])
    const tile = getting.getByRole("radio", { name: "Dee" })
    await expect.element(tile).toHaveAccessibleDescription("+$60.00 Former member")
    await tile.click()
    await screen.getByRole("textbox", { name: "Amount" }).fill("30")
    await expect
      .element(screen.getByRole("status", { name: "Summary" }))
      .toHaveTextContent("You pay Dee $30.00")
    await screen.getByRole("button", { name: "Record Payment" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ fromId: "ana", toId: "dee", amount: 3_000 }),
    )
  })
})

/** Adds an Expense that only Dee owes, as far as Review, on the real page. */
async function reachReview() {
  const rootRoute = createRootRoute()
  const appRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_app",
    beforeLoad: () => ({ session: { user: me }, apps: ["split"] }),
  })
  const newRoute = createRoute({
    getParentRoute: () => appRoute,
    path: "/split/expenses/new",
    component: AddExpensePage,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([appRoute.addChildren([newRoute])]),
    history: createMemoryHistory({ initialEntries: ["/split/expenses/new"] }),
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
  await screen.getByRole("textbox", { name: "Total" }).fill("90")
  await screen.getByRole("textbox", { name: "Description" }).fill("Pizza")
  await screen.getByRole("button", { name: "Next" }).click()
  await screen.getByRole("button", { name: "Next" }).click()
  await screen.getByRole("radio", { name: "Only Dee" }).click()
  await screen.getByRole("button", { name: "Next" }).click()
  return screen
}

describe("someone losing App access while an Expense is added", () => {
  /** The Accounts the server lists right now. */
  let listed: Member[] = []
  /** When set, the server refuses whatever is sent for its Category, archived meanwhile. */
  let categoryArchived = false
  let posted = 0

  function serve(path: string, method: string, body: unknown): Response {
    if (path === "/api/split/members") return Response.json({ rows: listed })
    if (path === "/api/split/categories") return Response.json({ rows: categories })
    if (path === "/api/split/expenses" && method === "GET") return Response.json({ rows: [] })
    if (path === "/api/split/expenses" && method === "POST") {
      posted += 1
      if (categoryArchived) {
        return Response.json(
          {
            error: {
              code: "validation_failed",
              message: "The Expense is not valid",
              details: [{ path: "categoryId", message: "Pick a Category" }],
            },
          },
          { status: 400 },
        )
      }
      const input = createExpense.parse(body)
      const resolved = resolveExpense(input, newExpenseRoster(memberIdsOf(listed)))
      if (!resolved.ok) {
        return Response.json(
          {
            error: {
              code: "validation_failed",
              message: "The Expense is not valid",
              details: resolved.problems.map(({ field, message }) => ({ path: field, message })),
            },
          },
          { status: 400 },
        )
      }
      return Response.json({}, { status: 500 })
    }
    return Response.json(
      { error: { code: "not_found", message: "No such route" } },
      { status: 404 },
    )
  }

  beforeEach(() => {
    listed = accounts.map((account) => ({ ...account, standing: "member" }))
    categoryArchived = false
    posted = 0
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
    await cleanupCollections()
    queryClient.clear()
    vi.unstubAllGlobals()
  })

  test.each([
    {
      when: "who is now a Former member",
      after: () => accounts,
      name: "Dee",
    },
    {
      // With nothing else in Split, she drops out of the list and her name is no longer known.
      when: "who drops out of the list",
      after: () => accounts.filter((account) => account.id !== "dee"),
      name: "Someone",
    },
  ])(
    "is refused by the server, and the form flags her on her step, $when",
    async ({ after, name }) => {
      const screen = await reachReview()
      listed = after()
      await screen.getByRole("button", { name: "Add Expense" }).click()
      await vi.waitFor(() => expect(posted).toBe(1))

      await expect
        .element(screen.getByRole("radiogroup", { name: "Who owes for it?" }))
        .toBeVisible()
      const editor = screen.getByRole("region", { name: "Owed side" })
      await expect.element(editor.getByRole("checkbox", { name })).toBeChecked()
      await expect.element(editor.getByText("No longer a Member: take them off")).toBeVisible()
      await expect
        .element(editor.getByRole("status", { name: "Tally" }))
        .toHaveTextContent("Only Members can be on an Expense")
      await expect.element(screen.getByRole("button", { name: "Next" })).toBeDisabled()

      // Taking her off clears it, and her row goes: she can't be added back.
      await editor.getByRole("checkbox", { name }).click()
      await editor.getByRole("checkbox", { name: "Ben" }).click()
      await expect
        .element(editor.getByRole("status", { name: "Tally" }))
        .toHaveTextContent("1 Member")
      expect(editor.getByRole("checkbox", { name }).elements()).toEqual([])
      await expect.element(screen.getByRole("button", { name: "Next" })).toBeEnabled()
    },
  )

  test("a refusal for another reason stays on Review, even once someone later loses access", async () => {
    const screen = await reachReview()
    categoryArchived = true
    await screen.getByRole("button", { name: "Add Expense" }).click()
    await vi.waitFor(() => expect(posted).toBe(1))
    await expect.element(screen.getByRole("button", { name: "Add Expense" })).toBeEnabled()

    // A later refetch shows Dee gone: Review says what blocks the save, but nothing jumps.
    listed = accounts
    await queryClient.invalidateQueries()
    await expect.element(screen.getByText("Owed: Only Members can be on an Expense")).toBeVisible()
    expect(screen.getByRole("radiogroup", { name: "Who owes for it?" }).elements()).toEqual([])
  })
})

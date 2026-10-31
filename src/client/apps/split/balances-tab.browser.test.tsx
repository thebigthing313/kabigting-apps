// The Balances tab: a row and bar per Member, Former members only while their Balance isn't zero,
// and suggested Payments that open Settle up filled in, from Split's Home with the real pages,
// hooks and collection against a fake server.
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
import { HomeView } from "@/apps/split/home-view"
import { SettleUpPage, settleUpSearch } from "@/apps/split/settle-up-page"
import { SplitHome } from "@/apps/split/split-home"
import { cleanupCollections } from "@/data/collection-factory"
import { queryClient } from "@/data/query-client"
import type { Expense, Member, Payment } from "@/data/split"
import { dismissToasts } from "@/test/toasts"
import { equalSide, type SuggestedPayment } from "@shared/split/rules"
import { createPayment } from "@shared/split/schemas"

// Made-up Accounts, oldest first; the viewer is Ana. Dee and Fay have lost App access; Gus only
// added an entry.
const me: Member = { id: "ana", name: "Ana", standing: "member" }
const members: Member[] = [
  { id: "dee", name: "Dee", standing: "former" },
  { id: "ben", name: "Ben", standing: "member" },
  me,
  { id: "fay", name: "Fay", standing: "former" },
  { id: "cy", name: "Cy", standing: "member" },
  { id: "gus", name: "Gus", standing: "author" },
]
const GENERAL = "0190a000-0000-7000-8000-000000000002"
const categories = [{ id: GENERAL, name: "General", archived: false }]
const ADDED_AT = "2026-10-03T16:00:00.000Z"

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "0190a000-0000-7000-8000-000000000100",
    description: "Groceries run",
    date: "2026-10-03",
    categoryId: GENERAL,
    total: 9_000,
    note: "",
    paid: equalSide(["ana"]),
    owed: equalSide(["ben", "ana", "cy"]),
    paidShares: { ana: 9_000 },
    owedShares: { ben: 3_000, ana: 3_000, cy: 3_000 },
    addedBy: "gus",
    addedAt: ADDED_AT,
    changedBy: "gus",
    changedAt: ADDED_AT,
    ...overrides,
  }
}

/**
 * Ana paid $90.00 everyone owes equally, and Dee owes Ben $20.00 from before she left: Ana is owed
 * $60.00, Ben $20.00 less his $30.00, Cy owes $30.00 and Dee $20.00.
 */
const groceries = expense({})
const oldDinner = expense({
  id: "0190a000-0000-7000-8000-000000000101",
  description: "Old dinner",
  total: 2_000,
  paid: equalSide(["ben"]),
  owed: equalSide(["dee"]),
  paidShares: { ben: 2_000 },
  owedShares: { dee: 2_000 },
})

async function renderTab(expenses: Expense[]) {
  const onSettleSuggestion = vi.fn<(payment: SuggestedPayment) => void>()
  const screen = await render(
    <HomeView
      viewerId="ana"
      members={members}
      expenses={expenses}
      payments={[]}
      categories={categories}
      tab="balances"
      onTabChange={() => {}}
      onAddExpense={() => {}}
      onSettleUp={() => {}}
      onSettleSuggestion={onSettleSuggestion}
      onOpenExpense={() => {}}
      onOpenPayment={() => {}}
      onManageCategories={() => {}}
    />,
  )
  return { screen, onSettleSuggestion }
}

const rowTexts = (screen: Awaited<ReturnType<typeof renderTab>>["screen"]) =>
  screen
    .getByRole("list", { name: "Balances" })
    .getByRole("listitem")
    .elements()
    .map((row) => row.textContent)

describe("the Balances tab", () => {
  test("a row per Member, you first; a Former member only while their Balance isn't zero", async () => {
    const { screen } = await renderTab([groceries, oldDinner])
    await expect.element(screen.getByRole("list", { name: "Balances" })).toBeVisible()
    expect(rowTexts(screen)).toEqual([
      "YouYou're owed $60.00",
      "Dee · Former memberDee owes $20.00",
      "BenBen owes $10.00",
      "CyCy owes $30.00",
    ])
    await expect
      .element(screen.getByText("Balances always add up to zero.", { exact: false }))
      .toBeVisible()
  })

  test("the suggestions bring everyone to zero, and tapping one hands it over", async () => {
    const { screen, onSettleSuggestion } = await renderTab([groceries, oldDinner])
    const settle = screen.getByRole("region", { name: "One way to settle everyone up" })
    expect(
      settle
        .getByRole("button")
        .elements()
        .map((button) => button.textContent),
    ).toEqual(["Cy pays you $30.00", "Dee pays you $20.00", "Ben pays you $10.00"])

    await settle.getByRole("button", { name: "Dee pays you $20.00" }).click()
    expect(onSettleSuggestion).toHaveBeenCalledExactlyOnceWith({
      fromId: "dee",
      toId: "ana",
      amount: 2_000,
    })
  })

  test("when everyone is at zero the tab says so, and Former members drop out", async () => {
    const { screen } = await renderTab([])
    expect(rowTexts(screen)).toEqual([
      "YouYou're settled up",
      "BenBen is settled up",
      "CyCy is settled up",
    ])
    const settle = screen.getByRole("region", { name: "One way to settle everyone up" })
    await expect.element(settle.getByText("Everyone's settled up.")).toBeVisible()
    expect(settle.getByRole("button").elements()).toEqual([])
  })
})

async function openSplit(initial: string) {
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
    validateSearch: (search: Record<string, unknown>) => ({
      tab: search["tab"] === "balances" ? ("balances" as const) : undefined,
    }),
    component: SplitHome,
  })
  const newRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/payments/new",
    validateSearch: settleUpSearch,
    component: SettleUpPage,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      appRoute.addChildren([splitRoute.addChildren([homeRoute, newRoute])]),
    ]),
    history: createMemoryHistory({ initialEntries: [initial] }),
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
  /** What the server holds, and every Payment sent to it. */
  let payments: Payment[] = []
  let writes: unknown[] = []

  beforeEach(() => {
    payments = []
    writes = []
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
      const method = (
        (input instanceof Request ? input.method : init?.method) ?? "GET"
      ).toUpperCase()
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null
      const path = url.pathname
      if (path === "/api/split/members") return Response.json({ rows: members })
      if (path === "/api/split/categories") return Response.json({ rows: categories })
      if (path === "/api/split/expenses") return Response.json({ rows: [groceries, oldDinner] })
      if (path === "/api/split/payments" && method === "GET") {
        return Response.json({ rows: payments })
      }
      if (path === "/api/split/payments" && method === "POST") {
        writes.push(body)
        const stored: Payment = {
          ...createPayment.parse(body),
          addedBy: me.id,
          addedAt: ADDED_AT,
          changedBy: me.id,
          changedAt: ADDED_AT,
        }
        payments = [...payments, stored]
        return Response.json(stored, { status: 201 })
      }
      return Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 })
    })
  })

  afterEach(async () => {
    dismissToasts()
    await cleanup()
    await cleanupCollections()
    queryClient.clear()
    vi.unstubAllGlobals()
  })

  test("tapping a suggestion opens Settle up filled in, and recording it moves the Balances", async () => {
    const { screen, router } = await openSplit("/split?tab=balances")
    const settle = screen.getByRole("region", { name: "One way to settle everyone up" })
    await settle.getByRole("button", { name: "Dee pays you $20.00" }).click()

    await expect.element(screen.getByRole("heading", { name: "Settle up" })).toBeVisible()
    expect(router.state.location.search).toEqual({ fromId: "dee", toId: "ana", amount: 2_000 })
    await expect
      .element(
        screen
          .getByRole("radiogroup", { name: "Who's paying?" })
          .getByRole("radio", { name: "Dee" }),
      )
      .toBeChecked()
    await expect
      .element(
        screen
          .getByRole("radiogroup", { name: "Who gets it?" })
          .getByRole("radio", { name: "You" }),
      )
      .toBeChecked()
    await expect.element(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("$20.00")
    await expect
      .element(screen.getByRole("status", { name: "Summary" }))
      .toHaveTextContent("Dee pays you $20.00")
    // Nothing is stored until the Payment is recorded.
    expect(writes).toEqual([])
    await screen.getByRole("button", { name: "Record Payment" }).click()

    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent(
        "Your Balance+$40.00The others owe youDee is settled up · Former memberBen owes $10.00" +
          "Fay is settled up · Former memberCy owes $30.00",
      )
    expect(writes).toEqual([
      {
        id: expect.any(String),
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        fromId: "dee",
        toId: "ana",
        amount: 2_000,
        note: "",
      },
    ])
  })

  test.each([
    ["someone unknown", "fromId=zed&toId=ana&amount=2000"],
    ["only an author", "fromId=gus&toId=ana&amount=2000"],
    ["the same Member twice", "fromId=ana&toId=ana&amount=2000"],
    ["a negative amount", "fromId=dee&toId=ana&amount=-2000"],
    ["a fraction of a cent", "fromId=dee&toId=ana&amount=20.5"],
    ["an amount that isn't a number", "fromId=dee&toId=ana&amount=lots"],
    ["a part missing", "fromId=dee&toId=ana"],
  ])("a suggestion naming %s opens the usual empty form", async (_, query) => {
    const { screen } = await openSplit(`/split/payments/new?${query}`)
    await expect.element(screen.getByRole("heading", { name: "Settle up" })).toBeVisible()
    await expect
      .element(
        screen
          .getByRole("radiogroup", { name: "Who's paying?" })
          .getByRole("radio", { name: "You" }),
      )
      .toBeChecked()
    await expect
      .element(
        screen
          .getByRole("radiogroup", { name: "Who gets it?" })
          .getByRole("radio", { name: "Ben" }),
      )
      .toBeChecked()
    await expect.element(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("")
  })
})

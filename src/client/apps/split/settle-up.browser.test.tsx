// Settle up: the Payment form on its own, then from Split's Home with the real pages, hooks and
// collection against a fake server that checks Payments the way the real one does.
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
import { EditPaymentPage } from "@/apps/split/edit-payment-page"
import { PaymentForm, type NewPayment } from "@/apps/split/payment-form"
import { SettleUpPage } from "@/apps/split/settle-up-page"
import { SplitHome } from "@/apps/split/split-home"
import { cleanupCollections } from "@/data/collection-factory"
import { queryClient } from "@/data/query-client"
import type { Expense, Payment } from "@/data/split"
import { dismissToasts } from "@/test/toasts"
import { equalSide, paymentProblems } from "@shared/split/rules"
import { createPayment, updatePayment } from "@shared/split/schemas"

// Made-up Members, oldest Account first; the viewer is Ana.
const me = { id: "ana", name: "Ana", former: false }
const members = [
  { id: "ben", name: "Ben", former: false },
  me,
  { id: "cy", name: "Cy", former: false },
]
const memberIds = new Set(members.map((member) => member.id))
const GENERAL = "0190a000-0000-7000-8000-000000000002"
const categories = [{ id: GENERAL, name: "General", archived: false }]
const PAYMENT_ID = "0190a000-0000-7000-8000-000000000200"
const ADDED_AT = "2026-10-03T16:00:00.000Z"
const CHANGED_AT = "2026-10-05T16:00:00.000Z"

/** Ana paid $90.00 that everyone owes equally: she is owed $60.00, Ben and Cy owe $30.00. */
const groceries: Expense = {
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
  addedBy: "ana",
  addedAt: ADDED_AT,
  changedBy: "ana",
  changedAt: ADDED_AT,
}

/** Ben paid Ana $30.00, settling up; Ben recorded it on Oct 3. */
function saved(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    date: "2026-10-03",
    fromId: "ben",
    toId: "ana",
    amount: 3_000,
    note: "Settling up",
    addedBy: "ben",
    addedAt: ADDED_AT,
    changedBy: "ben",
    changedAt: ADDED_AT,
    ...overrides,
  }
}

async function renderForm(editing?: Payment) {
  const onSave = vi.fn<(payment: NewPayment) => Promise<boolean>>(async () => true)
  const onCancel = vi.fn<() => void>()
  const onDelete = vi.fn<() => void>()
  const screen = await render(
    <PaymentForm
      viewerId="ana"
      members={members}
      balances={{ ben: -3_000, ana: 6_000, cy: -3_000 }}
      today="2026-10-31"
      onSave={onSave}
      onCancel={onCancel}
      editing={editing && { payment: editing, onDelete }}
    />,
  )
  return { screen, onSave, onCancel, onDelete }
}

describe("the Settle up form", () => {
  test("each tile shows that Member's Balance, and the summary reads in plain words", async () => {
    const { screen, onSave } = await renderForm()
    await expect.element(screen.getByRole("heading", { name: "Settle up" })).toBeVisible()
    const paying = screen.getByRole("radiogroup", { name: "Who's paying?" })
    const getting = screen.getByRole("radiogroup", { name: "Who gets it?" })
    expect(
      paying
        .getByRole("radio")
        .elements()
        .map((tile) => tile.textContent),
    ).toEqual(["BBen-$30.00", "AYou+$60.00", "CCy-$30.00"])
    // A new Payment starts as the viewer paying the oldest other Member.
    await expect.element(paying.getByRole("radio", { name: "You" })).toBeChecked()
    await expect.element(getting.getByRole("radio", { name: "Ben" })).toBeChecked()

    await paying.getByRole("radio", { name: "Cy" }).click()
    await getting.getByRole("radio", { name: "You" }).click()
    await screen.getByRole("textbox", { name: "Amount" }).fill("30")
    await screen.getByRole("textbox", { name: "Note" }).fill("  Settling up ")
    await expect
      .element(screen.getByRole("status", { name: "Summary" }))
      .toHaveTextContent("Cy pays you $30.00")
    await screen.getByRole("button", { name: "Record Payment" }).click()

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      date: "2026-10-31",
      fromId: "cy",
      toId: "ana",
      amount: 3_000,
      note: "Settling up",
    })
  })

  test("a Payment to oneself, or of zero or a negative Amount, can't be recorded", async () => {
    const { screen, onSave } = await renderForm()
    const record = screen.getByRole("button", { name: "Record Payment" })
    const fix = screen.getByRole("list", { name: "Still to fix" })
    await expect.element(fix).toHaveTextContent("Enter an amount above zero")
    await expect.element(record).toBeDisabled()

    await screen.getByRole("textbox", { name: "Amount" }).fill("-5")
    await expect.element(fix).toHaveTextContent("Enter an amount above zero")
    await expect.element(record).toBeDisabled()

    await screen.getByRole("textbox", { name: "Amount" }).fill("5")
    await expect.element(record).toBeEnabled()
    await screen
      .getByRole("radiogroup", { name: "Who gets it?" })
      .getByRole("radio", { name: "You" })
      .click()
    await expect.element(fix).toHaveTextContent("Pick two different Members")
    await expect.element(record).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  test("a saved Payment opens as it was, says who and when, and deletes on a second tap", async () => {
    const { screen, onSave, onDelete } = await renderForm(
      saved({ changedBy: "ana", changedAt: CHANGED_AT }),
    )
    await expect.element(screen.getByRole("heading", { name: "Edit Payment" })).toBeVisible()
    await expect
      .element(screen.getByRole("status", { name: "Summary" }))
      .toHaveTextContent("Ben pays you $30.00")
    await expect.element(screen.getByRole("textbox", { name: "Note" })).toHaveValue("Settling up")
    await expect
      .element(screen.getByText("Added by Ben on Oct 3 · changed by you on Oct 5"))
      .toBeVisible()

    await screen.getByRole("button", { name: "Delete Payment" }).click()
    expect(onDelete).not.toHaveBeenCalled()
    await screen.getByRole("button", { name: "Tap again to delete for good" }).click()
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onSave).not.toHaveBeenCalled()
  })
})

function refused(problems: ReturnType<typeof paymentProblems>): Response {
  return Response.json(
    {
      error: {
        code: "validation_failed",
        message: "The Payment is not valid",
        details: problems.map(({ field, message }) => ({ path: field, message })),
      },
    },
    { status: 400 },
  )
}

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
    path: "/payments/new",
    component: SettleUpPage,
  })
  const editRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/payments/$paymentId",
    component: function EditRoute() {
      return <EditPaymentPage paymentId={editRoute.useParams().paymentId} />
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      appRoute.addChildren([splitRoute.addChildren([homeRoute, newRoute, editRoute])]),
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
  /** What the server holds, and every write sent to it. */
  let payments: Payment[] = []
  let writes: { method: string; path: string; body: unknown }[] = []
  /** Deletes fail while set, as when the server has a fault. */
  let deletesFail = false

  function serve(path: string, method: string, body: unknown): Response {
    if (path === "/api/split/members") return Response.json({ rows: members })
    if (path === "/api/split/categories") return Response.json({ rows: categories })
    if (path === "/api/split/expenses") return Response.json({ rows: [groceries] })
    if (path === "/api/split/payments" && method === "GET") return Response.json({ rows: payments })
    if (path === "/api/split/payments" && method === "POST") {
      writes.push({ method, path, body })
      const input = createPayment.parse(body)
      const problems = paymentProblems(input, memberIds)
      if (problems.length > 0) return refused(problems)
      const stored: Payment = {
        ...input,
        addedBy: me.id,
        addedAt: CHANGED_AT,
        changedBy: me.id,
        changedAt: CHANGED_AT,
      }
      payments = [...payments, stored]
      return Response.json(stored, { status: 201 })
    }
    const id = path.replace("/api/split/payments/", "")
    const found = payments.find((payment) => payment.id === id)
    if (found && method === "PUT") {
      writes.push({ method, path, body })
      const input = updatePayment.parse(body)
      const stored: Payment = { ...found, ...input, changedBy: me.id, changedAt: CHANGED_AT }
      payments = payments.map((payment) => (payment.id === id ? stored : payment))
      return Response.json(stored)
    }
    if (found && method === "DELETE") {
      if (deletesFail) {
        writes.push({ method, path, body })
        return Response.json(
          { error: { code: "internal", message: "Something went wrong" } },
          { status: 500 },
        )
      }
      writes.push({ method, path, body })
      payments = payments.filter((payment) => payment.id !== id)
      return Response.json(found)
    }
    return Response.json(
      { error: { code: "not_found", message: "No such Payment" } },
      { status: 404 },
    )
  }

  beforeEach(() => {
    payments = []
    writes = []
    deletesFail = false
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

  test("recording a Payment moves both Members' Balances by its Amount", async () => {
    const { screen, router } = await openSplit()
    const balance = screen.getByRole("region", { name: "Your Balance" })
    await expect
      .element(balance)
      .toHaveTextContent("Your Balance+$60.00The others owe youBen owes $30.00Cy owes $30.00")

    await screen.getByRole("button", { name: "Settle up" }).click()
    await expect.element(screen.getByRole("heading", { name: "Settle up" })).toBeVisible()
    await screen
      .getByRole("radiogroup", { name: "Who's paying?" })
      .getByRole("radio", { name: "Ben" })
      .click()
    await screen
      .getByRole("radiogroup", { name: "Who gets it?" })
      .getByRole("radio", { name: "You" })
      .click()
    await screen.getByRole("textbox", { name: "Amount" }).fill("30")
    await screen.getByRole("button", { name: "Record Payment" }).click()

    await expect
      .element(balance)
      .toHaveTextContent("Your Balance+$30.00The others owe youBen is settled upCy owes $30.00")
    expect(router.state.location.pathname).toBe("/split")
    await expect.element(screen.getByText("Ben → You")).toBeVisible()
    expect(writes).toEqual([
      {
        method: "POST",
        path: "/api/split/payments",
        body: {
          id: expect.any(String),
          date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          fromId: "ben",
          toId: "ana",
          amount: 3_000,
          note: "",
        },
      },
    ])
  })

  test("tapping a Payment card opens it, and saving replaces it", async () => {
    payments = [saved()]
    const { screen, router } = await openSplit()
    await screen.getByRole("button", { name: "Edit Payment from Ben to you" }).click()
    await expect.element(screen.getByRole("heading", { name: "Edit Payment" })).toBeVisible()
    expect(router.state.location.pathname).toBe(`/split/payments/${PAYMENT_ID}`)
    await expect
      .element(
        screen
          .getByRole("radiogroup", { name: "Who's paying?" })
          .getByRole("radio", { name: "Ben" }),
      )
      .toBeChecked()

    await screen.getByRole("textbox", { name: "Amount" }).fill("12.50")
    await screen.getByRole("button", { name: "Save changes" }).click()

    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance+$47.50The others owe youBen owes $17.50Cy owes $30.00")
    await expect
      .element(screen.getByText("Added by Ben on Oct 3 · changed by you on Oct 5"))
      .toBeVisible()
    expect(writes).toEqual([
      {
        method: "PUT",
        path: `/api/split/payments/${PAYMENT_ID}`,
        body: {
          date: "2026-10-03",
          fromId: "ben",
          toId: "ana",
          amount: 1_250,
          note: "Settling up",
        },
      },
    ])
  })

  test("a second tap deletes it for good, and the Balances move back at once", async () => {
    payments = [saved()]
    const { screen, router } = await openSplit()
    const balance = screen.getByRole("region", { name: "Your Balance" })
    await expect
      .element(balance)
      .toHaveTextContent("Your Balance+$30.00The others owe youBen is settled upCy owes $30.00")
    await screen.getByRole("button", { name: "Edit Payment from Ben to you" }).click()
    await screen.getByRole("button", { name: "Delete Payment" }).click()
    expect(writes).toEqual([])
    await screen.getByRole("button", { name: "Tap again to delete for good" }).click()

    expect(router.state.location.pathname).toBe("/split")
    await expect
      .element(balance)
      .toHaveTextContent("Your Balance+$60.00The others owe youBen owes $30.00Cy owes $30.00")
    await vi.waitFor(() =>
      expect(writes).toEqual([
        { method: "DELETE", path: `/api/split/payments/${PAYMENT_ID}`, body: null },
      ]),
    )
  })

  test("a delete that fails brings the Payment and the Balances back", async () => {
    payments = [saved()]
    deletesFail = true
    const { screen } = await openSplit()
    const balance = screen.getByRole("region", { name: "Your Balance" })
    await screen.getByRole("button", { name: "Edit Payment from Ben to you" }).click()
    await screen.getByRole("button", { name: "Delete Payment" }).click()
    await screen.getByRole("button", { name: "Tap again to delete for good" }).click()

    await vi.waitFor(() => expect(writes).toHaveLength(1))
    await expect.element(screen.getByText("Ben → You")).toBeVisible()
    await expect
      .element(balance)
      .toHaveTextContent("Your Balance+$30.00The others owe youBen is settled upCy owes $30.00")
  })

  test("a Payment the server refuses rolls back, and the form stays open", async () => {
    const { screen, router } = await openSplit()
    await screen.getByRole("button", { name: "Settle up" }).click()
    // Say Ben lost App access after the form opened: only the server can tell.
    memberIds.delete("ben")
    try {
      await screen.getByRole("textbox", { name: "Amount" }).fill("10")
      await screen.getByRole("button", { name: "Record Payment" }).click()
      await expect.element(screen.getByRole("button", { name: "Record Payment" })).toBeEnabled()
      await vi.waitFor(() => expect(writes).toHaveLength(1))
      expect(router.state.location.pathname).toBe("/split/payments/new")
      await expect.element(screen.getByText("The Payment is not valid")).toBeVisible()
    } finally {
      memberIds.add("ben")
    }
  })
})

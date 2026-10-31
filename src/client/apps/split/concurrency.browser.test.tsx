// Two Members at once, and a dropped connection: the Expense flow and the Settle up form share one
// pattern, so every case runs against both, with the real pages, hooks and collections against a
// fake server that stores whole records, last save winning.
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
import { EditExpensePage } from "@/apps/split/edit-expense-page"
import { EditPaymentPage } from "@/apps/split/edit-payment-page"
import { SettleUpPage } from "@/apps/split/settle-up-page"
import { SplitHome } from "@/apps/split/split-home"
import { cleanupCollections } from "@/data/collection-factory"
import { queryClient } from "@/data/query-client"
import type { Expense, Payment } from "@/data/split"
import { dismissToasts } from "@/test/toasts"
import { editExpenseRoster, equalSide, newExpenseRoster, resolveExpense } from "@shared/split/rules"
import { createExpense, createPayment, updateExpense, updatePayment } from "@shared/split/schemas"

// Made-up Members, oldest Account first; the viewer is Ana.
const me = { id: "ana", name: "Ana" }
const members = [{ id: "ben", name: "Ben" }, me, { id: "cy", name: "Cy" }]
const memberIds = members.map((member) => member.id)
const GENERAL = "0190a000-0000-7000-8000-000000000002"
const categories = [{ id: GENERAL, name: "General", archived: false }]
const EXPENSE_ID = "0190a000-0000-7000-8000-000000000100"
const PAYMENT_ID = "0190a000-0000-7000-8000-000000000200"
const ADDED_AT = "2026-10-03T16:00:00.000Z"
// 3:42 PM in the household zone.
const THEIR_CHANGE_AT = "2026-10-06T19:42:00.000Z"
const SAVED_AT = "2026-10-07T16:00:00.000Z"

/** Ben paid $90.00 for groceries, which everyone owes equally. */
const groceries: Expense = {
  id: EXPENSE_ID,
  description: "Groceries run",
  date: "2026-10-03",
  categoryId: GENERAL,
  total: 9_000,
  note: "",
  paid: equalSide(["ben"]),
  owed: equalSide(["ben", "ana", "cy"]),
  paidShares: { ben: 9_000 },
  owedShares: { ben: 3_000, ana: 3_000, cy: 3_000 },
  addedBy: "ben",
  addedAt: ADDED_AT,
  changedBy: "ben",
  changedAt: ADDED_AT,
}

/** Ben paid Ana $30.00. */
const settling: Payment = {
  id: PAYMENT_ID,
  date: "2026-10-03",
  fromId: "ben",
  toId: "ana",
  amount: 3_000,
  note: "",
  addedBy: "ben",
  addedAt: ADDED_AT,
  changedBy: "ben",
  changedAt: ADDED_AT,
}

type Screen = Awaited<ReturnType<typeof render>>

/** What differs between the two forms; every case below runs against each. */
type Form = {
  kind: "Expense" | "Payment"
  collection: "expenses" | "payments"
  saveLabel: string
  addLabel: string
  /** The saved one's card on Split's Home, and the card of the new one `fillNew` makes. */
  card: string
  newCard: string
  /** Changes the open draft. */
  changeDraft: (screen: Screen) => Promise<void>
  /** Shows the draft as `changeDraft` left it. */
  draftShown: (screen: Screen) => Promise<void>
  /** Changes the open draft a second way, and what the server then stores. */
  changeDraftAgain: (screen: Screen) => Promise<void>
  againStored: Record<string, unknown>
  /** The change `by` (Ben, unless given) saves elsewhere, and how the form shows it once loaded. */
  theirs: (by?: string) => void
  theirsShown: (screen: Screen) => Promise<void>
  /** Fills a new one, up to its add button. */
  fillNew: (screen: Screen) => Promise<void>
  /** Stores a second one, `SECOND_ID`, and how the form shows it. */
  second: () => void
  secondShown: (screen: Screen) => Promise<void>
}

const SECOND_ID = "0190a000-0000-7000-8000-000000000300"

/** What the server holds. */
let expenses: Expense[] = []
let payments: Payment[] = []
/** Every write that reached the server. */
let writes: { method: string; path: string }[] = []
/** While set, nothing reaches the server. */
let offline = false
/** While set, a write is stored but its answer is lost on the way back. */
let loseAnswer = false
/** While set, the viewer has lost App access to Split. */
let noAccess = false

const forms: Form[] = [
  {
    kind: "Expense",
    collection: "expenses",
    saveLabel: "Save changes",
    addLabel: "Add Expense",
    card: "Edit Groceries run",
    newCard: "Edit Lunch",
    changeDraft: async (screen) => {
      await screen.getByRole("button", { name: "Change Owed" }).click()
      await screen.getByRole("radio", { name: "Only Cy" }).click()
      await screen.getByRole("button", { name: "Done" }).click()
    },
    draftShown: async (screen) => {
      await expect.element(screen.getByText("Cy owes $90.00")).toBeVisible()
    },
    changeDraftAgain: async (screen) => {
      await screen.getByRole("button", { name: "Change What" }).click()
      await screen.getByRole("textbox", { name: "Description" }).fill("Big shop")
      await screen.getByRole("button", { name: "Done" }).click()
    },
    againStored: { description: "Big shop", owed: equalSide(["cy"]) },
    theirs: (by = "ben") => {
      expenses = expenses.map((expense) => ({
        ...expense,
        description: "Weekly shop",
        changedBy: by,
        changedAt: THEIR_CHANGE_AT,
      }))
    },
    theirsShown: async (screen) => {
      await expect.element(screen.getByText("Weekly shop")).toBeVisible()
      await expect.element(screen.getByText("You, Ben and Cy owe $30.00 each")).toBeVisible()
    },
    fillNew: async (screen) => {
      await screen.getByRole("textbox", { name: "Total" }).fill("12")
      await screen.getByRole("textbox", { name: "Description" }).fill("Lunch")
      await screen.getByRole("button", { name: "Next" }).click()
      await screen.getByRole("button", { name: "Next" }).click()
      await screen.getByRole("button", { name: "Next" }).click()
    },
    second: () => {
      expenses = [...expenses, { ...groceries, id: SECOND_ID, description: "Hardware" }]
    },
    secondShown: async (screen) => {
      await expect.element(screen.getByText("Hardware")).toBeVisible()
      await expect.element(screen.getByText("You, Ben and Cy owe $30.00 each")).toBeVisible()
    },
  },
  {
    kind: "Payment",
    collection: "payments",
    saveLabel: "Save changes",
    addLabel: "Record Payment",
    card: "Edit Payment from Ben to you",
    newCard: "Edit Payment from You to Ben",
    changeDraft: async (screen) => {
      await screen.getByRole("textbox", { name: "Amount" }).fill("45")
    },
    draftShown: async (screen) => {
      await expect
        .element(screen.getByRole("status", { name: "Summary" }))
        .toHaveTextContent("Ben pays you $45.00")
    },
    changeDraftAgain: async (screen) => {
      await screen.getByRole("textbox", { name: "Note" }).fill("Late")
    },
    againStored: { amount: 4_500, note: "Late" },
    theirs: (by = "ben") => {
      payments = payments.map((payment) => ({
        ...payment,
        amount: 2_500,
        changedBy: by,
        changedAt: THEIR_CHANGE_AT,
      }))
    },
    theirsShown: async (screen) => {
      await expect
        .element(screen.getByRole("status", { name: "Summary" }))
        .toHaveTextContent("Ben pays you $25.00")
    },
    fillNew: async (screen) => {
      await screen.getByRole("textbox", { name: "Amount" }).fill("20")
    },
    second: () => {
      payments = [...payments, { ...settling, id: SECOND_ID, amount: 1_000 }]
    },
    secondShown: async (screen) => {
      await expect
        .element(screen.getByRole("status", { name: "Summary" }))
        .toHaveTextContent("Ben pays you $10.00")
    },
  },
]

function failure(status: number, code: string): Response {
  return Response.json({ error: { code, message: "Refused" } }, { status })
}

function storeExpense(method: string, id: string, body: unknown): Response {
  const found = expenses.find((expense) => expense.id === id)
  if (method === "POST") {
    if (found) return failure(409, "conflict")
    const input = createExpense.parse(body)
    const resolved = resolveExpense(input, newExpenseRoster(memberIds))
    if (!resolved.ok) return failure(400, "validation_failed")
    const stored: Expense = {
      ...input,
      paidShares: resolved.paidShares,
      owedShares: resolved.owedShares,
      addedBy: me.id,
      addedAt: SAVED_AT,
      changedBy: me.id,
      changedAt: SAVED_AT,
    }
    expenses = [...expenses, stored]
    return Response.json(stored, { status: 201 })
  }
  if (!found) return failure(404, "not_found")
  if (method === "DELETE") {
    expenses = expenses.filter((expense) => expense.id !== id)
    return Response.json(found)
  }
  const input = updateExpense.parse(body)
  const resolved = resolveExpense(input, editExpenseRoster(memberIds, memberIds, found))
  if (!resolved.ok) return failure(400, "validation_failed")
  const stored: Expense = {
    ...found,
    ...input,
    paidShares: resolved.paidShares,
    owedShares: resolved.owedShares,
    changedBy: me.id,
    changedAt: SAVED_AT,
  }
  expenses = expenses.map((expense) => (expense.id === id ? stored : expense))
  return Response.json(stored)
}

function storePayment(method: string, id: string, body: unknown): Response {
  const found = payments.find((payment) => payment.id === id)
  if (method === "POST") {
    if (found) return failure(409, "conflict")
    const input = createPayment.parse(body)
    const stored: Payment = {
      ...input,
      addedBy: me.id,
      addedAt: SAVED_AT,
      changedBy: me.id,
      changedAt: SAVED_AT,
    }
    payments = [...payments, stored]
    return Response.json(stored, { status: 201 })
  }
  if (!found) return failure(404, "not_found")
  if (method === "DELETE") {
    payments = payments.filter((payment) => payment.id !== id)
    return Response.json(found)
  }
  const input = updatePayment.parse(body)
  const stored: Payment = { ...found, ...input, changedBy: me.id, changedAt: SAVED_AT }
  payments = payments.map((payment) => (payment.id === id ? stored : payment))
  return Response.json(stored)
}

function serve(path: string, method: string, body: unknown): Response {
  if (method !== "GET") writes.push({ method, path })
  // Losing App access refuses every Split route, reads included.
  if (noAccess) return failure(403, "forbidden_app")
  if (method === "GET") {
    if (path === "/api/split/members") return Response.json({ rows: members })
    if (path === "/api/split/categories") return Response.json({ rows: categories })
    if (path === "/api/split/expenses") return Response.json({ rows: expenses })
    if (path === "/api/split/payments") return Response.json({ rows: payments })
    return failure(404, "not_found")
  }
  const [, , , collection, id] = path.split("/")
  if (collection === "expenses") {
    return storeExpense(method, id ?? createExpense.parse(body).id, body)
  }
  return storePayment(method, id ?? createPayment.parse(body).id, body)
}

beforeEach(() => {
  expenses = [groceries]
  payments = [settling]
  writes = []
  offline = false
  loseAnswer = false
  noAccess = false
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (offline) throw new TypeError("Failed to fetch")
    const url = new URL(input instanceof Request ? input.url : String(input), location.origin)
    const method = ((input instanceof Request ? input.method : init?.method) ?? "GET").toUpperCase()
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null
    const answer = serve(url.pathname, method, body)
    if (loseAnswer && method !== "GET") throw new TypeError("Failed to fetch")
    return answer
  })
})

afterEach(async () => {
  dismissToasts()
  await cleanup()
  await cleanupCollections()
  queryClient.clear()
  vi.unstubAllGlobals()
})

async function open(path: string) {
  const rootRoute = createRootRoute()
  const shellHome = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <h1>Shell Home</h1>,
  })
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
  const addExpenseRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/expenses/new",
    component: AddExpensePage,
  })
  const editExpenseRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/expenses/$expenseId",
    component: function EditExpenseRoute() {
      return <EditExpensePage expenseId={editExpenseRoute.useParams().expenseId} />
    },
  })
  const settleUpRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/payments/new",
    component: SettleUpPage,
  })
  const editPaymentRoute = createRoute({
    getParentRoute: () => splitRoute,
    path: "/payments/$paymentId",
    component: function EditPaymentRoute() {
      return <EditPaymentPage paymentId={editPaymentRoute.useParams().paymentId} />
    },
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      shellHome,
      appRoute.addChildren([
        splitRoute.addChildren([
          homeRoute,
          addExpenseRoute,
          editExpenseRoute,
          settleUpRoute,
          editPaymentRoute,
        ]),
      ]),
    ]),
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

/** A refetch, as when the app regains focus or reconnects. */
function refetch(form: Form) {
  return queryClient.refetchQueries({ queryKey: ["split", form.collection] })
}

describe.each(forms)("the $kind form", (form) => {
  const editPath = `/split/${form.collection}/${form.kind === "Expense" ? EXPENSE_ID : PAYMENT_ID}`
  const newPath = `/split/${form.collection}/new`
  const rows = () => (form.kind === "Expense" ? expenses : payments)

  async function openEdit() {
    const opened = await open(editPath)
    await expect
      .element(opened.screen.getByRole("heading", { name: `Edit ${form.kind}` }))
      .toBeVisible()
    return opened
  }

  test("a newer version keeps the draft, says who and when, and Load their version shows it", async () => {
    const { screen } = await openEdit()
    await form.changeDraft(screen)
    form.theirs()
    await refetch(form)

    const notice = screen.getByText(
      "Ben changed this at 3:42 PM. Saving will replace their change.",
    )
    await expect.element(notice).toBeVisible()
    await form.draftShown(screen)

    await screen.getByRole("button", { name: "Load their version" }).click()
    await form.theirsShown(screen)
    await expect.element(notice).not.toBeInTheDocument()
  })

  test("saving after a newer version replaces their change, whole", async () => {
    const { screen, router } = await openEdit()
    await form.changeDraft(screen)
    form.theirs()
    await refetch(form)
    await expect.element(screen.getByText(/Saving will replace their change/)).toBeVisible()

    await screen.getByRole("button", { name: form.saveLabel }).click()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/split"))
    expect(rows()[0]).toMatchObject({ changedBy: "ana", changedAt: SAVED_AT })
    // Nothing of Ben's change was merged in.
    expect(rows()[0]).toMatchObject(
      form.kind === "Expense" ? { description: "Groceries run" } : { amount: 4_500 },
    )
  })

  test("deleted elsewhere, found on refetch: the form leaves with a toast", async () => {
    const { screen, router } = await openEdit()
    await form.changeDraft(screen)
    expenses = []
    payments = []
    await refetch(form)

    await expect
      .element(screen.getByText(`This ${form.kind} was deleted, so your changes weren't saved`))
      .toBeVisible()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/split"))
    expect(writes).toEqual([])
  })

  test("deleted elsewhere, found on save: the form leaves with a toast, and nothing is recreated", async () => {
    const { screen, router } = await openEdit()
    await form.changeDraft(screen)
    expenses = []
    payments = []
    await screen.getByRole("button", { name: form.saveLabel }).click()

    await expect
      .element(screen.getByText(`This ${form.kind} was deleted, so your changes weren't saved`))
      .toBeVisible()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/split"))
    expect(writes).toEqual([{ method: "PUT", path: editPath.replace("/split", "/api/split") }])
    expect(rows()).toEqual([])
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()
  })

  test("deleting what is already gone counts as deleted, quietly", async () => {
    const { screen, router } = await openEdit()
    expenses = []
    payments = []
    await screen.getByRole("button", { name: `Delete ${form.kind}` }).click()
    await screen.getByRole("button", { name: "Tap again to delete for good" }).click()

    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/split"))
    await vi.waitFor(() => expect(writes).toHaveLength(1))
    // The round trip of a refetch lets the failed delete settle first.
    await refetch(form)
    await expect.element(screen.getByText("Deleting failed")).not.toBeInTheDocument()
    await expect
      .element(screen.getByText(/was deleted, so your changes weren't saved/))
      .not.toBeInTheDocument()
    await expect.element(screen.getByRole("button", { name: form.card })).not.toBeInTheDocument()
  })

  test("losing access shows it and goes to the Shell's Home", async () => {
    const { screen, router } = await openEdit()
    await form.changeDraft(screen)
    noAccess = true
    await screen.getByRole("button", { name: form.saveLabel }).click()

    await expect.element(screen.getByText("You no longer have access to Split")).toBeVisible()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"))
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()
  })

  test("a save that fails offline stays, with everything kept, until Try again", async () => {
    const { screen, router } = await openEdit()
    await form.changeDraft(screen)
    offline = true
    await screen.getByRole("button", { name: form.saveLabel }).click()

    await expect.element(screen.getByText("You appear to be offline. Not saved.")).toBeVisible()
    await form.draftShown(screen)
    expect(router.state.location.pathname).toBe(editPath)
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()

    // The connection comes back: nothing is saved until the viewer asks.
    offline = false
    window.dispatchEvent(new Event("online"))
    await refetch(form)
    expect(writes).toEqual([])
    await expect.element(screen.getByText("You appear to be offline. Not saved.")).toBeVisible()

    // Try again sends the draft as it stands now, changed since the failed save.
    await form.changeDraftAgain(screen)
    await screen.getByRole("button", { name: "Try again" }).click()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/split"))
    expect(writes).toHaveLength(1)
    expect(rows()[0]).toMatchObject({ ...form.againStored, changedBy: "ana", changedAt: SAVED_AT })
  })

  test("a retried save that had already landed (409 on its own id) counts as saved", async () => {
    const { screen, router } = await open(newPath)
    await form.fillNew(screen)
    // The first try is stored, but its answer never arrives.
    loseAnswer = true
    await screen.getByRole("button", { name: form.addLabel }).click()
    await expect.element(screen.getByText("You appear to be offline. Not saved.")).toBeVisible()
    expect(rows()).toHaveLength(2)

    loseAnswer = false
    await screen.getByRole("button", { name: "Try again" }).click()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/split"))
    expect(writes.map((write) => write.method)).toEqual(["POST", "POST"])
    expect(rows()).toHaveLength(2)
    await expect.element(screen.getByText("Saving failed")).not.toBeInTheDocument()
    // What the first try stored shows on Split's Home.
    await expect.element(screen.getByRole("button", { name: form.newCard })).toBeVisible()
  })
  test("a newer version saved by the viewer elsewhere says it was theirs", async () => {
    const { screen } = await openEdit()
    await form.changeDraft(screen)
    form.theirs("ana")
    await refetch(form)

    await expect
      .element(screen.getByText("You changed this at 3:42 PM. Saving will replace that change."))
      .toBeVisible()
    await screen.getByRole("button", { name: "Load that version" }).click()
    await form.theirsShown(screen)
  })

  test("the notice never shows for the form's own save", async () => {
    const { screen, router } = await openEdit()
    let shown = false
    const watch = new MutationObserver(() => {
      if (document.body.textContent?.includes("changed this at")) shown = true
    })
    watch.observe(document.body, { childList: true, subtree: true, characterData: true })
    await form.changeDraft(screen)
    await screen.getByRole("button", { name: form.saveLabel }).click()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/split"))
    await expect.element(screen.getByRole("button", { name: form.card })).toBeVisible()
    watch.disconnect()
    expect(shown).toBe(false)
  })

  test("Load their version clears a failed save's offline notice", async () => {
    const { screen } = await openEdit()
    await form.changeDraft(screen)
    offline = true
    await screen.getByRole("button", { name: form.saveLabel }).click()
    await expect.element(screen.getByText("You appear to be offline. Not saved.")).toBeVisible()

    offline = false
    form.theirs()
    await refetch(form)
    await screen.getByRole("button", { name: "Load their version" }).click()
    await form.theirsShown(screen)
    await expect
      .element(screen.getByText("You appear to be offline. Not saved."))
      .not.toBeInTheDocument()
  })

  test("opening another one in the same page starts its draft afresh", async () => {
    form.second()
    const { screen, router } = await openEdit()
    await form.changeDraft(screen)
    await router.navigate({ to: editPath.replace(/[^/]+$/, SECOND_ID) })

    await form.secondShown(screen)
    await expect.element(screen.getByText(/changed this at/)).not.toBeInTheDocument()
  })

  test("losing access found by a refetch shows it and goes to the Shell's Home", async () => {
    const { screen, router } = await openEdit()
    await form.changeDraft(screen)
    noAccess = true
    await refetch(form)

    await expect.element(screen.getByText("You no longer have access to Split")).toBeVisible()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"))
    expect(writes).toEqual([])
  })

  test("losing access found by a delete shows it and goes to the Shell's Home", async () => {
    const { screen, router } = await openEdit()
    noAccess = true
    await screen.getByRole("button", { name: `Delete ${form.kind}` }).click()
    await screen.getByRole("button", { name: "Tap again to delete for good" }).click()

    await expect.element(screen.getByText("You no longer have access to Split")).toBeVisible()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"))
    await expect.element(screen.getByText("Deleting failed")).not.toBeInTheDocument()
  })

  test("adding offline stays, with everything kept, until Try again", async () => {
    const { screen, router } = await open(newPath)
    await form.fillNew(screen)
    offline = true
    await screen.getByRole("button", { name: form.addLabel }).click()
    await expect.element(screen.getByText("You appear to be offline. Not saved.")).toBeVisible()
    expect(writes).toEqual([])
    expect(rows()).toHaveLength(1)

    offline = false
    await screen.getByRole("button", { name: "Try again" }).click()
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/split"))
    expect(writes.map((write) => write.method)).toEqual(["POST"])
    await expect.element(screen.getByRole("button", { name: form.newCard })).toBeVisible()
  })
})

test("the Expense flow's steps work offline, and keep what was entered", async () => {
  const { screen } = await open("/split/expenses/new")
  await expect.element(screen.getByRole("heading", { name: "New Expense" })).toBeVisible()
  offline = true
  await screen.getByRole("textbox", { name: "Total" }).fill("12")
  await screen.getByRole("textbox", { name: "Description" }).fill("Lunch")
  await screen.getByRole("button", { name: "Next" }).click()
  await screen.getByRole("radio", { name: "Ben paid it all" }).click()
  await screen.getByRole("button", { name: "Next" }).click()
  await screen.getByRole("radio", { name: "Only Cy" }).click()
  await screen.getByRole("button", { name: "Next" }).click()
  await expect.element(screen.getByText("Ben paid $12.00")).toBeVisible()
  await expect.element(screen.getByText("Cy owes $12.00")).toBeVisible()

  // Back to the first step and on again, all offline: nothing is lost.
  await screen
    .getByRole("navigation", { name: "Steps" })
    .getByRole("button", { name: "What" })
    .click()
  await expect.element(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Lunch")
  await screen
    .getByRole("navigation", { name: "Steps" })
    .getByRole("button", { name: "Review" })
    .click()
  await expect.element(screen.getByText("Lunch")).toBeVisible()
  await expect.element(screen.getByText("Cy owes $12.00")).toBeVisible()
  expect(writes).toEqual([])
})

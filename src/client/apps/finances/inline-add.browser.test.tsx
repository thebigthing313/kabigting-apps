// Saving right after adding an Account or Category inline: no request naming the new name goes
// out until the server has stored it.
import { afterEach, describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { cleanup, render } from "vitest-browser-react"
import { ScheduleForm } from "@/apps/finances/schedules/schedule-form"
import { TransactionForm } from "@/apps/finances/transactions/transaction-form"
import { addSchedule } from "@/data/finances-schedules"
import { addTransaction } from "@/data/finances-transactions"

const CHECKING = "11111111-1111-7111-8111-111111111111"
const WALLETS = [{ id: CHECKING, name: "Test checking", shownAsOwed: false }]
const ACCOUNTS = "/api/finances/accounts"
const CATEGORIES = "/api/finances/categories"
const TRANSACTIONS = "/api/finances/transactions"
const SCHEDULES = "/api/finances/schedules"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

type Sent = { path: string; body: Record<string, unknown> }

/**
 * Stands in for the server: nothing stored yet, every write logged as it arrives and echoed
 * back, except that an Account or Category create waits for the test to answer it (or refuse it).
 */
function fakeServer() {
  const sent: Sent[] = []
  const waiting: { path: string; answer: (refuse: boolean) => void }[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith("/query")) return json({ rows: [] })
    const body: Record<string, unknown> = await request.json()
    sent.push({ path, body })
    const now = "2026-10-01T12:00:00.000Z"
    const stored = json({
      note: "",
      archived: false,
      mergedIntoId: null,
      ...body,
      createdAt: now,
      updatedAt: now,
    })
    if (path !== ACCOUNTS && path !== CATEGORIES) return stored
    return new Promise<Response>((reply) => {
      waiting.push({
        path,
        answer: (refuse) =>
          reply(
            refuse
              ? json({ error: { code: "conflict", message: "That name is taken" } }, 409)
              : stored,
          ),
      })
    })
  })
  return {
    /** Every write that reached the server so far, in order. */
    sent,
    paths: () => sent.map((request) => request.path),
    /** Answers the oldest create to this path still waiting. */
    async answer(path: string, refuse = false) {
      await vi.waitFor(() => expect(waiting.some((create) => create.path === path)).toBe(true))
      const [create] = waiting.splice(
        waiting.findIndex((entry) => entry.path === path),
        1,
      )
      create?.answer(refuse)
    },
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function addInline(
  screen: Awaited<ReturnType<typeof render>>,
  label: string,
  name: string,
): Promise<void> {
  await userEvent.fill(screen.getByLabelText(label), name)
  await screen.getByRole("option", { name: `Add "${name}"` }).click()
  await expect.element(screen.getByLabelText(label)).toHaveValue(name)
}

function renderAddForm() {
  return render(
    <TransactionForm
      wallets={WALLETS}
      status="actual"
      walletId={CHECKING}
      onSave={(entry) => addTransaction(entry)}
    />,
  )
}

// The collections live for the whole file, so each test adds names of its own.
afterEach(async () => {
  await cleanup()
  vi.restoreAllMocks()
})

describe("saving right after an inline add", () => {
  test("the Add form sends its Actual only once the new Account and Category are stored", async () => {
    const server = fakeServer()
    const screen = await renderAddForm()
    await userEvent.fill(screen.getByLabelText("Amount"), "12")
    await addInline(screen, "Account", "Made-up Grocer")
    await addInline(screen, "Category", "Made-up Groceries")
    await screen.getByRole("button", { name: "Add Actual" }).click()

    await pause(100)
    expect(server.paths()).toEqual([ACCOUNTS, CATEGORIES])
    await server.answer(ACCOUNTS)
    await pause(100)
    expect(server.paths()).toEqual([ACCOUNTS, CATEGORIES])
    await server.answer(CATEGORIES)

    await vi.waitFor(() => expect(server.paths()).toEqual([ACCOUNTS, CATEGORIES, TRANSACTIONS]))
    const [account, category, actual] = server.sent
    expect(actual?.body).toMatchObject({
      accountId: account?.body.id,
      categoryId: category?.body.id,
    })
  })

  test("a refused Account is never sent on: the form stays and the Account is cleared", async () => {
    const server = fakeServer()
    const screen = await renderAddForm()
    await userEvent.fill(screen.getByLabelText("Amount"), "12")
    await addInline(screen, "Account", "Made-up Taken Name")
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await server.answer(ACCOUNTS, true)

    await expect.element(screen.getByLabelText("Account")).toHaveValue("")
    await expect.element(screen.getByRole("button", { name: "Add Actual" })).toBeEnabled()
    await expect.element(screen.getByLabelText("Amount")).toHaveValue("$12.00")
    await pause(100)
    expect(server.paths()).toEqual([ACCOUNTS])

    // Saving again goes ahead, without the refused Account.
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await vi.waitFor(() => expect(server.paths()).toEqual([ACCOUNTS, TRANSACTIONS]))
    expect(server.sent[1]?.body).toMatchObject({ accountId: null })
  })

  test("the New Schedule form sends its Schedule only once a new Category is stored", async () => {
    const server = fakeServer()
    const screen = await render(
      <ScheduleForm wallets={WALLETS} onSave={(schedule) => addSchedule(schedule)} />,
    )
    await userEvent.fill(screen.getByLabelText("Amount"), "1,500")
    await addInline(screen, "Category", "Made-up Housing")
    await screen.getByRole("button", { name: "Add Schedule" }).click()

    await pause(100)
    expect(server.paths()).toEqual([CATEGORIES])
    await server.answer(CATEGORIES)
    await vi.waitFor(() => expect(server.paths()).toEqual([CATEGORIES, SCHEDULES]))
    expect(server.sent[1]?.body).toMatchObject({ categoryId: server.sent[0]?.body.id })
  })
})

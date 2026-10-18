// Saving right after adding an Account or Category inline: the form waits for the server to
// store the new name before it saves anything that names it.
import { afterEach, describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { cleanup, render } from "vitest-browser-react"
import { ScheduleForm } from "@/apps/finances/schedules/schedule-form"
import { TransactionForm } from "@/apps/finances/transactions/transaction-form"
import type { NewSchedule } from "@/data/finances-schedules"
import type { NewTransaction } from "@/data/finances-transactions"

const CHECKING = "11111111-1111-7111-8111-111111111111"
const WALLETS = [{ id: CHECKING, name: "Test checking", shownAsOwed: false }]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Stands in for the server: no Accounts or Categories yet, and each create waits for the test to
 * answer it, echoing the row back unless told to refuse it.
 */
function fakeServer() {
  const waiting: { path: string; answer: (refuse: boolean) => void }[] = []
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init)
    const path = new URL(request.url).pathname
    if (path.endsWith("/query")) return json({ rows: [] })
    const sent: Record<string, unknown> = await request.json()
    const now = "2026-10-01T12:00:00.000Z"
    return new Promise<Response>((reply) => {
      waiting.push({
        path,
        answer: (refuse) =>
          reply(
            refuse
              ? json({ error: { code: "conflict", message: "That name is taken" } }, 409)
              : json({
                  note: "",
                  archived: false,
                  mergedIntoId: null,
                  ...sent,
                  createdAt: now,
                  updatedAt: now,
                }),
          ),
      })
    })
  })
  return {
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

// The collections live for the whole file, so each test adds names of its own.
afterEach(async () => {
  await cleanup()
  vi.restoreAllMocks()
})

describe("saving right after an inline add", () => {
  test("the Add form saves only once the new Account and Category are stored", async () => {
    const server = fakeServer()
    const onSave = vi.fn<(entry: NewTransaction) => void>()
    const screen = await render(
      <TransactionForm wallets={WALLETS} status="actual" walletId={CHECKING} onSave={onSave} />,
    )
    await userEvent.fill(screen.getByLabelText("Amount"), "12")
    await addInline(screen, "Account", "Made-up Grocer")
    await addInline(screen, "Category", "Made-up Groceries")
    await screen.getByRole("button", { name: "Add Actual" }).click()

    await pause(100)
    expect(onSave).not.toHaveBeenCalled()
    await server.answer("/api/finances/accounts")
    await pause(100)
    expect(onSave).not.toHaveBeenCalled()
    await server.answer("/api/finances/categories")

    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    const entry = onSave.mock.calls[0]?.[0]
    expect(entry?.accountId).toEqual(expect.any(String))
    expect(entry?.categoryId).toEqual(expect.any(String))
  })

  test("a refused Account is not saved: the form stays and the Account is cleared", async () => {
    const server = fakeServer()
    const onSave = vi.fn<(entry: NewTransaction) => void>()
    const screen = await render(
      <TransactionForm wallets={WALLETS} status="actual" walletId={CHECKING} onSave={onSave} />,
    )
    await userEvent.fill(screen.getByLabelText("Amount"), "12")
    await addInline(screen, "Account", "Made-up Taken Name")
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await server.answer("/api/finances/accounts", true)

    await expect.element(screen.getByLabelText("Account")).toHaveValue("")
    await expect.element(screen.getByRole("button", { name: "Add Actual" })).toBeEnabled()
    expect(onSave).not.toHaveBeenCalled()
    await expect.element(screen.getByLabelText("Amount")).toHaveValue("$12.00")

    // Saving again goes ahead, without the refused Account.
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ accountId: null })),
    )
  })

  test("the New Schedule form waits for a new Category too", async () => {
    const server = fakeServer()
    const onSave = vi.fn<(schedule: NewSchedule) => void>()
    const screen = await render(<ScheduleForm wallets={WALLETS} onSave={onSave} />)
    await userEvent.fill(screen.getByLabelText("Amount"), "1,500")
    await addInline(screen, "Category", "Made-up Housing")
    await screen.getByRole("button", { name: "Add Schedule" }).click()

    await pause(100)
    expect(onSave).not.toHaveBeenCalled()
    await server.answer("/api/finances/categories")
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ categoryId: expect.any(String) }),
      ),
    )
  })
})

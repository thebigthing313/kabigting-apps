// Entries the Splitwise import wrote say so, with the date, in place of who added them: on Home's
// cards, on the Expense's Review and on the Payment form. Members, amounts and dates are made up.
import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { ExpenseFlow } from "@/apps/split/expense-flow"
import { HomeView } from "@/apps/split/home-view"
import { PaymentForm } from "@/apps/split/payment-form"
import type { Category, Expense, Member, Payment } from "@/data/split"
import type { Side } from "@shared/split/schemas"

// Made-up Members, oldest Account first; the viewer is Ana. The Admin ran the import.
const members: Member[] = [
  { id: "admin", name: "Admin", standing: "member" },
  { id: "ana", name: "Ana", standing: "member" },
  { id: "ben", name: "Ben", standing: "member" },
]
const GROCERIES = "0190a000-0000-7000-8000-000000000001"
const categories: Category[] = [{ id: GROCERIES, name: "Groceries", archived: false }]
// 02:00 UTC on Oct 31 is still Oct 30 in the household zone.
const IMPORTED_AT = "2026-10-31T02:00:00.000Z"

/** Exact dollars, as the import stores both sides. */
function exactSide(exact: Record<string, number>): Side {
  return { mode: "exact", ticked: Object.keys(exact), exact, percent: {} }
}

/** Ana paid $70.00 for groceries that Ana owes $30.00 of and Ben $40.00, imported. */
function imported(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "0190a000-0000-7000-8000-000000000100",
    description: "Groceries run",
    date: "2025-03-14",
    categoryId: GROCERIES,
    total: 7_000,
    note: "",
    paid: exactSide({ ana: 7_000 }),
    owed: exactSide({ ana: 3_000, ben: 4_000 }),
    paidShares: { ana: 7_000 },
    owedShares: { ana: 3_000, ben: 4_000 },
    addedBy: "admin",
    addedAt: IMPORTED_AT,
    changedBy: "admin",
    changedAt: IMPORTED_AT,
    imported: true,
    ...overrides,
  }
}

/** Ben paid Ana $25.00, imported. */
const importedPayment: Payment = {
  id: "0190a000-0000-7000-8000-000000000200",
  date: "2025-03-20",
  fromId: "ben",
  toId: "ana",
  amount: 2_500,
  note: "",
  addedBy: "admin",
  addedAt: IMPORTED_AT,
  changedBy: "admin",
  changedAt: IMPORTED_AT,
  imported: true,
}

describe("an imported entry", () => {
  test("Home's cards say Imported from Splitwise, not who added it", async () => {
    const screen = await render(
      <HomeView
        viewerId="ana"
        members={members}
        expenses={[imported()]}
        payments={[importedPayment]}
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
    const cards = screen.getByRole("article")
    await expect.element(cards.nth(0)).toBeVisible()
    for (const card of cards.elements()) {
      expect(card.textContent).toMatch(/Imported from Splitwise on Oct 30$/)
      expect(card.textContent).not.toContain("Added by")
    }
  })

  test("a later change still shows who made it", async () => {
    const screen = await render(
      <HomeView
        viewerId="ana"
        members={members}
        expenses={[imported({ changedBy: "ben", changedAt: "2026-11-02T15:00:00.000Z" })]}
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
      .element(screen.getByText("Imported from Splitwise on Oct 30 · changed by Ben on Nov 2"))
      .toBeVisible()
  })

  test("an imported Expense opens on Review in exact dollars, with the imported line", async () => {
    const screen = await render(
      <ExpenseFlow
        viewerId="ana"
        members={members}
        categories={categories}
        today="2026-10-31"
        onSave={vi.fn(async () => "saved" as const)}
        onCancel={() => {}}
        editing={{ expense: imported(), onDelete: () => {} }}
      />,
    )
    await expect.element(screen.getByRole("heading", { name: "Edit Expense" })).toBeVisible()
    await expect.element(screen.getByText("Imported from Splitwise on Oct 30")).toBeVisible()
    await expect.element(screen.getByText("You paid $70.00")).toBeVisible()
    await expect.element(screen.getByText("You owe $30.00; Ben owes $40.00")).toBeVisible()
  })

  test("the Payment form shows the imported line", async () => {
    const screen = await render(
      <PaymentForm
        viewerId="ana"
        members={members}
        balances={{ admin: 0, ana: -2_500, ben: 2_500 }}
        today="2026-10-31"
        onSave={vi.fn(async () => "saved" as const)}
        onCancel={() => {}}
        editing={{ payment: importedPayment, onDelete: () => {} }}
      />,
    )
    await expect.element(screen.getByText("Imported from Splitwise on Oct 30")).toBeVisible()
  })
})

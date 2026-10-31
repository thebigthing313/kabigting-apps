import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { HomeView } from "@/apps/split/home-view"
import type { Category, Expense, Member } from "@/data/split"
import { equalSide } from "@shared/split/rules"

// Made-up Members, oldest Account first; the viewer is Ana.
const members: Member[] = [
  { id: "ben", name: "Ben" },
  { id: "ana", name: "Ana" },
  { id: "cy", name: "Cy" },
]

const GROCERIES = "0190a000-0000-7000-8000-000000000001"
const categories: Category[] = [{ id: GROCERIES, name: "Groceries", archived: false }]

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: "0190a000-0000-7000-8000-000000000100",
    description: "Groceries run",
    date: "2026-10-30",
    categoryId: GROCERIES,
    total: 9_000,
    note: "",
    paid: equalSide(["ana"]),
    owed: equalSide(["ben", "ana", "cy"]),
    paidShares: { ana: 9_000 },
    owedShares: { ben: 3_000, ana: 3_000, cy: 3_000 },
    addedBy: "ana",
    addedAt: "2026-10-30T12:00:00.000Z",
    changedBy: "ana",
    changedAt: "2026-10-30T12:00:00.000Z",
    ...overrides,
  }
}

async function renderHome(expenses: Expense[]) {
  const onAddExpense = vi.fn<() => void>()
  const onOpenExpense = vi.fn<(expenseId: string) => void>()
  const screen = await render(
    <HomeView
      viewerId="ana"
      members={members}
      expenses={expenses}
      categories={categories}
      onAddExpense={onAddExpense}
      onOpenExpense={onOpenExpense}
    />,
  )
  return { screen, onAddExpense, onOpenExpense }
}

describe("Split's Home", () => {
  test("with nothing recorded, everyone is settled up", async () => {
    const { screen, onAddExpense } = await renderHome([])
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance$0.00You're settled upBen is settled upCy is settled up")
    await expect.element(screen.getByText("Nothing yet. Add an Expense to start.")).toBeVisible()
    await screen.getByRole("button", { name: "Add Expense" }).click()
    expect(onAddExpense).toHaveBeenCalled()
  })

  test("Balances in words, and the feed newest first with each Expense's effect on the viewer", async () => {
    const { screen } = await renderHome([
      expense({}),
      expense({
        id: "0190a000-0000-7000-8000-000000000101",
        description: "Pizza",
        date: "2026-10-31",
        total: 5_000,
        paid: equalSide(["cy"]),
        owed: equalSide(["ben", "cy"]),
        paidShares: { cy: 5_000 },
        owedShares: { ben: 2_500, cy: 2_500 },
      }),
    ])
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance+$60.00The others owe youBen owes $55.00Cy owes $5.00")

    const cards = screen.getByRole("article")
    await expect.element(cards.nth(0)).toBeVisible()
    expect(cards.elements().map((each) => each.textContent)).toEqual([
      "Pizza$50.00Oct 31, 2026 · GroceriesCy paid $50.00Ben and Cy owe $25.00 eachDoesn't involve youAdded by you on Oct 30",
      "Groceries run$90.00Oct 30, 2026 · GroceriesYou paid $90.00You, Ben and Cy owe $30.00 eachYour Balance +$60.00Added by you on Oct 30",
    ])
  })

  test("the viewer owing reads as owing the others", async () => {
    const { screen } = await renderHome([
      expense({ paid: equalSide(["ben"]), paidShares: { ben: 9_000 } }),
    ])
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance-$30.00You owe the othersBen is owed $60.00Cy owes $30.00")
    await expect.element(screen.getByText("Your Balance -$30.00")).toBeVisible()
  })

  test("each card says who added it and who changed it, and opens it whoever added it", async () => {
    const { screen, onOpenExpense } = await renderHome([
      expense({
        addedBy: "ben",
        // 01:00 UTC on Oct 6 is still Oct 5 in the household zone.
        changedAt: "2026-10-06T01:00:00.000Z",
        changedBy: "ana",
        addedAt: "2026-10-03T15:00:00.000Z",
      }),
    ])
    await expect
      .element(screen.getByText("Added by Ben on Oct 3 · changed by you on Oct 5"))
      .toBeVisible()
    await screen.getByRole("button", { name: "Edit Groceries run" }).click()
    expect(onOpenExpense).toHaveBeenCalledWith("0190a000-0000-7000-8000-000000000100")
  })
})

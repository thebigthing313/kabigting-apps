import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { HomeView } from "@/apps/split/home-view"
import type { Category, Expense, Member, Payment } from "@/data/split"
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

/** Ben pays Ana $40.00, settling up; Ben recorded it on Oct 31. */
function payment(overrides: Partial<Payment>): Payment {
  return {
    id: "0190a000-0000-7000-8000-000000000200",
    date: "2026-10-31",
    fromId: "ben",
    toId: "ana",
    amount: 4_000,
    note: "Settling up",
    addedBy: "ben",
    addedAt: "2026-10-31T12:00:00.000Z",
    changedBy: "ben",
    changedAt: "2026-10-31T12:00:00.000Z",
    ...overrides,
  }
}

async function renderHome(expenses: Expense[], payments: Payment[] = []) {
  const onAddExpense = vi.fn<() => void>()
  const onSettleUp = vi.fn<() => void>()
  const onOpenExpense = vi.fn<(expenseId: string) => void>()
  const onOpenPayment = vi.fn<(paymentId: string) => void>()
  const screen = await render(
    <HomeView
      viewerId="ana"
      members={members}
      expenses={expenses}
      payments={payments}
      categories={categories}
      onAddExpense={onAddExpense}
      onSettleUp={onSettleUp}
      onOpenExpense={onOpenExpense}
      onOpenPayment={onOpenPayment}
      onManageCategories={() => {}}
    />,
  )
  return { screen, onAddExpense, onSettleUp, onOpenExpense, onOpenPayment }
}

describe("Split's Home", () => {
  test("with nothing recorded, everyone is settled up", async () => {
    const { screen, onAddExpense } = await renderHome([])
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance$0.00You're settled upBen is settled upCy is settled up")
    await expect
      .element(screen.getByText("Nothing yet. Add an Expense or settle up to start."))
      .toBeVisible()
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

  test("Payments count in the Balances and show in the feed as From → To", async () => {
    const { screen, onSettleUp, onOpenPayment } = await renderHome(
      [expense({})],
      [
        payment({}),
        payment({
          id: "0190a000-0000-7000-8000-000000000201",
          date: "2026-10-29",
          fromId: "cy",
          toId: "ben",
          amount: 500,
          note: "",
          addedBy: "cy",
          addedAt: "2026-10-29T12:00:00.000Z",
          changedAt: "2026-10-29T12:00:00.000Z",
        }),
      ],
    )
    // Ana is owed $60.00; Ben paying her $40.00 brings it to $20.00. Cy paid Ben $5.00.
    await expect
      .element(screen.getByRole("region", { name: "Your Balance" }))
      .toHaveTextContent("Your Balance+$20.00The others owe youBen is owed $5.00Cy owes $25.00")
    const cards = screen.getByRole("article")
    await expect.element(cards.nth(0)).toBeVisible()
    expect(cards.elements().map((each) => each.textContent)).toEqual([
      "Ben → You$40.00Oct 31, 2026 · Payment · Settling upYour Balance -$40.00Added by Ben on Oct 31",
      expect.stringContaining("Groceries run$90.00"),
      "Cy → Ben$5.00Oct 29, 2026 · PaymentDoesn't involve youAdded by Cy on Oct 29",
    ])

    await screen.getByRole("button", { name: "Edit Payment from Ben to you" }).click()
    expect(onOpenPayment).toHaveBeenCalledWith("0190a000-0000-7000-8000-000000000200")
    await screen.getByRole("button", { name: "Settle up" }).click()
    expect(onSettleUp).toHaveBeenCalled()
  })

  test("Expenses and Payments on the same date show the one added last first", async () => {
    const { screen } = await renderHome(
      [
        expense({ addedAt: "2026-10-30T12:00:00.000Z" }),
        expense({
          id: "0190a000-0000-7000-8000-000000000101",
          description: "Pizza",
          addedAt: "2026-10-30T14:00:00.000Z",
        }),
      ],
      [payment({ date: "2026-10-30", addedAt: "2026-10-30T13:00:00.000Z" })],
    )
    const cards = screen.getByRole("article")
    await expect.element(cards.nth(0)).toBeVisible()
    expect(cards.elements().map((each) => each.textContent?.split("$")[0])).toEqual([
      "Pizza",
      "Ben → You",
      "Groceries run",
    ])
  })
})

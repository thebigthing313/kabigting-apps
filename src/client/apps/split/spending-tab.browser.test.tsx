import "@/styles.css"
import { useState } from "react"
import { describe, expect, test } from "vitest"
import { render } from "vitest-browser-react"
import type { HomeTab } from "@/apps/split/home-tab"
import { HomeView } from "@/apps/split/home-view"
import type { Category, Expense, Member, Payment } from "@/data/split"
import { formatDisplayDate, monthDates, shiftMonth, thisMonth } from "@shared/dates"
import { equalSide } from "@shared/split/rules"

// Made-up Members, oldest Account first; the viewer is Ana.
const members: Member[] = [
  { id: "ben", name: "Ben", standing: "member" },
  { id: "ana", name: "Ana", standing: "member" },
  { id: "cy", name: "Cy", standing: "member" },
]

const GROCERIES = "0190a000-0000-7000-8000-000000000001"
const DINING = "0190a000-0000-7000-8000-000000000002"
const TRAVEL = "0190a000-0000-7000-8000-000000000003"
const HOME = "0190a000-0000-7000-8000-000000000004"
const categories: Category[] = [
  { id: GROCERIES, name: "Groceries", archived: false },
  { id: DINING, name: "Dining out", archived: false },
  // Archived, yet still counted.
  { id: TRAVEL, name: "Travel", archived: true },
  { id: HOME, name: "Home", archived: false },
]

const THIS_MONTH = monthDates(thisMonth()).first
const LAST_MONTH = monthDates(shiftMonth(thisMonth(), -1)).first
const LONG_AGO = monthDates(shiftMonth(thisMonth(), -30)).first

let nextId = 100
function expense(overrides: Partial<Expense>): Expense {
  nextId += 1
  return {
    id: `0190a000-0000-7000-8000-000000000${nextId}`,
    description: "Groceries run",
    date: THIS_MONTH,
    categoryId: GROCERIES,
    total: 9_000,
    note: "",
    paid: equalSide(["ana"]),
    owed: equalSide(["ben", "ana", "cy"]),
    paidShares: { ana: 9_000 },
    owedShares: { ben: 3_000, ana: 3_000, cy: 3_000 },
    addedBy: "ana",
    addedAt: "2026-01-01T12:00:00.000Z",
    changedBy: "ana",
    changedAt: "2026-01-01T12:00:00.000Z",
    ...overrides,
  }
}

const expenses: Expense[] = [
  expense({}),
  // Ana got $30.00 back and shares it with Ben.
  expense({
    description: "Returned a lamp",
    total: -3_000,
    paid: equalSide(["ana"]),
    owed: equalSide(["ben", "ana"]),
    paidShares: { ana: -3_000 },
    owedShares: { ben: -1_500, ana: -1_500 },
    addedAt: "2026-01-02T12:00:00.000Z",
  }),
  // Doesn't involve Ana.
  expense({
    description: "Pizza night",
    categoryId: DINING,
    total: 12_000,
    paid: equalSide(["cy"]),
    owed: equalSide(["ben", "cy"]),
    paidShares: { cy: 12_000 },
    owedShares: { ben: 6_000, cy: 6_000 },
  }),
  expense({
    description: "Train tickets",
    date: LAST_MONTH,
    categoryId: TRAVEL,
    total: 30_000,
    paid: equalSide(["ben"]),
    owed: { mode: "exact", ticked: [], exact: { ana: 20_000, ben: 10_000 }, percent: {} },
    paidShares: { ben: 30_000 },
    owedShares: { ana: 20_000, ben: 10_000 },
  }),
  expense({
    description: "New sofa",
    date: LONG_AGO,
    categoryId: HOME,
    total: 100_000,
    paidShares: { ana: 100_000 },
    owedShares: { ana: 50_000, ben: 50_000 },
  }),
]

// Payments in every period, which are never spending.
const payments: Payment[] = [THIS_MONTH, LAST_MONTH, LONG_AGO].map((date, index) => ({
  id: `0190a000-0000-7000-8000-00000000020${index}`,
  date,
  fromId: "ana",
  toId: "ben",
  amount: 77_700,
  note: "Settling up",
  addedBy: "ana",
  addedAt: "2026-01-01T12:00:00.000Z",
  changedBy: "ana",
  changedAt: "2026-01-01T12:00:00.000Z",
}))

/** Home with its tab kept in state, as the route keeps it in the address. */
function Harness() {
  const [tab, setTab] = useState<HomeTab>("activity")
  return (
    <HomeView
      viewerId="ana"
      members={members}
      expenses={expenses}
      payments={payments}
      categories={categories}
      tab={tab}
      onTabChange={setTab}
      onAddExpense={() => {}}
      onSettleUp={() => {}}
      onSettleSuggestion={() => {}}
      onOpenExpense={() => {}}
      onOpenPayment={() => {}}
      onManageCategories={() => {}}
    />
  )
}

async function openSpending() {
  const screen = await render(<Harness />)
  const tabs = screen.getByRole("tab")
  await expect.element(tabs.first()).toHaveAccessibleName("Activity")
  expect(tabs.elements().map((each) => each.textContent)).toEqual([
    "Activity",
    "Balances",
    "Spending",
  ])
  await expect.element(tabs.first()).toHaveAttribute("aria-selected", "true")
  await screen.getByRole("tab", { name: "Spending" }).click()
  return screen
}

type Screen = Awaited<ReturnType<typeof openSpending>>

/** Each bar's Category and amount, in the order shown. */
function bars(screen: Screen): string[] {
  return screen
    .getByRole("list", { name: "Spending by Category" })
    .getByRole("listitem")
    .elements()
    .map((each) => each.textContent)
}

describe("the Spending tab", () => {
  test("opens on Last 3 months for the household: a total, then a bar per Category largest first", async () => {
    const screen = await openSpending()
    await expect
      .element(screen.getByRole("radio", { name: "Last 3 months" }))
      .toHaveAttribute("aria-checked", "true")
    await expect
      .element(screen.getByRole("radio", { name: "Household" }))
      .toHaveAttribute("aria-checked", "true")
    // The Refund nets against Groceries: $90.00 less $30.00. The Payments count for nothing.
    await expect
      .element(screen.getByRole("group", { name: "Spending total" }))
      .toHaveTextContent("$480.00Household spending · last 3 months")
    expect(bars(screen)).toEqual(["Travel$300.00", "Dining out$120.00", "Groceries$60.00"])
  })

  test("the period chips change the total and the bars, hiding empty Categories", async () => {
    const screen = await openSpending()
    await screen.getByRole("radio", { name: "This month" }).click()
    await expect
      .element(screen.getByRole("group", { name: "Spending total" }))
      .toHaveTextContent("$180.00Household spending · this month")
    expect(bars(screen)).toEqual(["Dining out$120.00", "Groceries$60.00"])

    await screen.getByRole("radio", { name: "Last month" }).click()
    await expect
      .element(screen.getByRole("group", { name: "Spending total" }))
      .toHaveTextContent("$300.00Household spending · last month")
    expect(bars(screen)).toEqual(["Travel$300.00"])

    await screen.getByRole("radio", { name: "All time" }).click()
    await expect
      .element(screen.getByRole("group", { name: "Spending total" }))
      .toHaveTextContent("$1,480.00Household spending · all time")
    expect(bars(screen)).toEqual([
      "Home$1,000.00",
      "Travel$300.00",
      "Dining out$120.00",
      "Groceries$60.00",
    ])
  })

  test("My share counts only the viewer's Owed shares", async () => {
    const screen = await openSpending()
    await screen.getByRole("radio", { name: "My share" }).click()
    // Travel $200.00, and Groceries $30.00 less Ana's $15.00 of the Refund. Pizza isn't hers.
    await expect
      .element(screen.getByRole("group", { name: "Spending total" }))
      .toHaveTextContent("$215.00Your share · last 3 months")
    expect(bars(screen)).toEqual(["Travel$200.00", "Groceries$15.00"])
  })

  test("tapping a bar lists its Expenses in the period, and tapping it again clears them", async () => {
    const screen = await openSpending()
    const groceries = screen.getByRole("button", { name: /^Groceries/ })
    await groceries.click()
    await expect.element(groceries).toHaveAttribute("aria-pressed", "true")
    const listed = screen.getByRole("region", { name: "Groceries Expenses" })
    await expect.element(listed).toBeVisible()
    const date = formatDisplayDate(THIS_MONTH)
    expect(
      listed
        .getByRole("listitem")
        .elements()
        .map((each) => each.textContent),
    ).toEqual([
      `Returned a lamp${date} · Your Balance -$15.00-$30.00`,
      `Groceries run${date} · Your Balance +$60.00$90.00`,
    ])

    // My share lists the viewer's share of each instead.
    await screen.getByRole("radio", { name: "My share" }).click()
    expect(
      listed
        .getByRole("listitem")
        .elements()
        .map((each) => each.textContent),
    ).toEqual([
      `Returned a lamp${date} · Your Balance -$15.00-$15.00`,
      `Groceries run${date} · Your Balance +$60.00$30.00`,
    ])

    await groceries.click()
    await expect.element(groceries).toHaveAttribute("aria-pressed", "false")
    await expect.element(listed).not.toBeInTheDocument()
  })

  test("an Expense that doesn't involve the viewer says so", async () => {
    const screen = await openSpending()
    await screen.getByRole("button", { name: /^Dining out/ }).click()
    await expect
      .element(screen.getByRole("region", { name: "Dining out Expenses" }))
      .toHaveTextContent(
        `Dining outPizza night${formatDisplayDate(THIS_MONTH)} · Doesn't involve you$120.00`,
      )
  })

  test("a period with only Payments in it has no spending", async () => {
    const screen = await render(
      <HomeView
        viewerId="ana"
        members={members}
        expenses={[]}
        payments={payments}
        categories={categories}
        tab="spending"
        onTabChange={() => {}}
        onAddExpense={() => {}}
        onSettleUp={() => {}}
        onSettleSuggestion={() => {}}
        onOpenExpense={() => {}}
        onOpenPayment={() => {}}
        onManageCategories={() => {}}
      />,
    )
    await expect.element(screen.getByText("No Expenses in this period.")).toBeVisible()
    await expect
      .element(screen.getByRole("group", { name: "Spending total" }))
      .toHaveTextContent("$0.00Household spending · last 3 months")
  })
})

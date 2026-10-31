import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { ExpenseFlow, type NewExpense } from "@/apps/split/expense-flow"
import type { Category, Member } from "@/data/split"
import { equalSide } from "@shared/split/rules"

// Made-up Members, oldest Account first; the viewer is Ana, who is not the oldest.
const members: Member[] = [
  { id: "ben", name: "Ben" },
  { id: "ana", name: "Ana" },
  { id: "cy", name: "Cy" },
]

const GROCERIES = "0190a000-0000-7000-8000-000000000001"
const GENERAL = "0190a000-0000-7000-8000-000000000002"
const categories: Category[] = [
  { id: GROCERIES, name: "Groceries", archived: false },
  { id: GENERAL, name: "General", archived: false },
]

async function renderFlow() {
  const onSave = vi.fn<(expense: NewExpense) => Promise<boolean>>(async () => true)
  const onCancel = vi.fn<() => void>()
  const screen = await render(
    <ExpenseFlow
      viewerId="ana"
      members={members}
      categories={categories}
      today="2026-10-31"
      onSave={onSave}
      onCancel={onCancel}
    />,
  )
  return { screen, onSave, onCancel }
}

type Screen = Awaited<ReturnType<typeof renderFlow>>["screen"]

const next = (screen: Screen) => screen.getByRole("button", { name: "Next" })
const step = (screen: Screen, name: string) =>
  screen.getByRole("navigation", { name: "Steps" }).getByRole("button", { name })

async function fillWhat(screen: Screen) {
  await screen.getByRole("textbox", { name: "Total" }).fill("100.00")
  await screen.getByRole("textbox", { name: "Description" }).fill("Groceries run")
}

describe("the one-tap Expense flow", () => {
  test("What starts on today and General, and Next waits for a total and a description", async () => {
    const { screen } = await renderFlow()
    await expect.element(screen.getByLabelText("Date")).toHaveValue("2026-10-31")
    await expect.element(screen.getByRole("radio", { name: "General" })).toBeChecked()
    await expect.element(next(screen)).toBeDisabled()
    await screen.getByRole("textbox", { name: "Total" }).fill("0")
    await screen.getByRole("textbox", { name: "Description" }).fill("Groceries run")
    await expect.element(next(screen)).toBeDisabled()
    await screen.getByRole("textbox", { name: "Total" }).fill("12.50")
    await expect.element(next(screen)).toBeEnabled()
    // Steps not reached yet can't be jumped to.
    await expect.element(step(screen, "Review")).toBeDisabled()
  })

  test("the defaults save as the viewer paying it all and everyone owing equally", async () => {
    const { screen, onSave } = await renderFlow()
    await fillWhat(screen)
    await screen.getByRole("radio", { name: "Groceries" }).click()
    await screen.getByRole("textbox", { name: "Note" }).fill("  Paid at the till ")
    await next(screen).click()

    // The viewer is offered first, then the others oldest Account first.
    const paid = screen.getByRole("radiogroup", { name: "Who paid?" }).getByRole("radio")
    expect(paid.elements().map((answer) => answer.textContent)).toEqual([
      "You paid it all",
      "Ben paid it all",
      "Cy paid it all",
    ])
    await expect.element(paid.nth(0)).toBeChecked()
    await next(screen).click()

    const owed = screen.getByRole("radiogroup", { name: "Who owes for it?" }).getByRole("radio")
    expect(owed.elements().map((answer) => answer.textContent)).toEqual([
      "Everyone equally",
      "Only you",
      "Only Ben",
      "Only Cy",
    ])
    await expect.element(owed.nth(0)).toBeChecked()
    await next(screen).click()

    // $100.00 three ways: the leftover cent goes to the oldest Account, Ben.
    await expect.element(screen.getByText("You paid $100.00")).toBeVisible()
    await expect
      .element(screen.getByText("You and Cy owe $33.33 each; Ben owes $33.34"))
      .toBeVisible()
    await expect
      .element(screen.getByText(/Groceries · Oct 31, 2026 · Paid at the till/))
      .toBeVisible()

    await screen.getByRole("button", { name: "Add Expense" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith({
      description: "Groceries run",
      date: "2026-10-31",
      categoryId: GROCERIES,
      total: 10_000,
      note: "Paid at the till",
      paid: equalSide(["ana"]),
      owed: equalSide(["ben", "ana", "cy"]),
    })
  })

  test("one tap picks someone else who paid and only one Member who owes", async () => {
    const { screen, onSave } = await renderFlow()
    await fillWhat(screen)
    await next(screen).click()
    await screen.getByRole("radio", { name: "Cy paid it all" }).click()
    await next(screen).click()
    await screen.getByRole("radio", { name: "Only you" }).click()
    await next(screen).click()

    await expect.element(screen.getByText("Cy paid $100.00")).toBeVisible()
    await expect.element(screen.getByText("You owe $100.00")).toBeVisible()
    await screen.getByRole("button", { name: "Add Expense" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ paid: equalSide(["cy"]), owed: equalSide(["ana"]) }),
    )
  })

  test("the step bar and the pencils go back to a step already reached", async () => {
    const { screen, onSave } = await renderFlow()
    await fillWhat(screen)
    await next(screen).click()
    await next(screen).click()
    await next(screen).click()

    await screen.getByRole("button", { name: "Change Paid" }).click()
    await expect.element(screen.getByRole("radiogroup", { name: "Who paid?" })).toBeVisible()
    await screen.getByRole("radio", { name: "Ben paid it all" }).click()
    await step(screen, "What").click()
    await screen.getByRole("textbox", { name: "Description" }).fill("")
    await step(screen, "Review").click()

    await expect.element(screen.getByText("Ben paid $100.00")).toBeVisible()
    await expect
      .element(screen.getByRole("list", { name: "Still to fix" }))
      .toHaveTextContent("Add a description")
    await expect.element(screen.getByRole("button", { name: "Add Expense" })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  test("the back arrow on What cancels", async () => {
    const { screen, onCancel } = await renderFlow()
    await screen.getByRole("button", { name: "Cancel" }).click()
    expect(onCancel).toHaveBeenCalled()
  })
})

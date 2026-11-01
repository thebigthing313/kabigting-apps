import "@/styles.css"
import { describe, expect, test, vi } from "vitest"
import { render } from "vitest-browser-react"
import { ExpenseFlow, type NewExpense } from "@/apps/split/expense-flow"
import type { Category, EntryOutcome, Member } from "@/data/split"
import { equalSide } from "@shared/split/rules"

// Made-up Members, oldest Account first; the viewer is Ana, who is not the oldest.
const members: Member[] = [
  { id: "ben", name: "Ben", standing: "member" },
  { id: "ana", name: "Ana", standing: "member" },
  { id: "cy", name: "Cy", standing: "member" },
]

const GROCERIES = "0190a000-0000-7000-8000-000000000001"
const GENERAL = "0190a000-0000-7000-8000-000000000002"
const categories: Category[] = [
  { id: GROCERIES, name: "Groceries", archived: false },
  { id: GENERAL, name: "General", archived: false },
]

async function renderFlow() {
  const onSave = vi.fn<(expense: NewExpense) => Promise<EntryOutcome>>(async () => "saved")
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
      "Several people paid",
    ])
    await expect.element(paid.nth(0)).toBeChecked()
    await next(screen).click()

    const owed = screen.getByRole("radiogroup", { name: "Who owes for it?" }).getByRole("radio")
    expect(owed.elements().map((answer) => answer.textContent)).toEqual([
      "Everyone equally",
      "Only you",
      "Only Ben",
      "Only Cy",
      "Split it differently",
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

const tally = (screen: Screen) => screen.getByRole("status", { name: "Tally" })

/** The tally's words, and whether it shows the side balanced (green) or not (amber). */
async function expectTally(screen: Screen, text: string, balanced: boolean) {
  await expect.element(tally(screen)).toHaveTextContent(text)
  await expect.element(tally(screen)).toHaveAttribute("data-balanced", String(balanced))
}

describe("the full editor", () => {
  test("each side has its own Split mode, and Next waits until the side adds up", async () => {
    const { screen, onSave } = await renderFlow()
    await fillWhat(screen)
    await next(screen).click()

    await screen.getByRole("radio", { name: "Several people paid" }).click()
    const mode = screen.getByRole("radiogroup", { name: "Split mode" })
    // It opens on the answer it replaces: you paid it all, equally.
    await expect.element(mode.getByRole("radio", { name: "Equally" })).toBeChecked()
    await expect.element(screen.getByRole("checkbox", { name: "You" })).toBeChecked()
    await expect.element(screen.getByRole("checkbox", { name: "Ben" })).not.toBeChecked()
    await expectTally(screen, "1 Member", true)

    // Exact $ starts from the current cents.
    await mode.getByRole("radio", { name: "Exact $" }).click()
    const amountFor = (name: string) => screen.getByRole("textbox", { name: `Amount for ${name}` })
    await expect.element(amountFor("you")).toHaveValue("$100.00")
    await expect.element(amountFor("Ben")).toHaveValue("")
    await amountFor("you").fill("60")
    await expectTally(screen, "$40.00 left to assign", false)
    await expect.element(next(screen)).toBeDisabled()
    await amountFor("Ben").fill("45")
    await expectTally(screen, "$5.00 over", false)
    await amountFor("Ben").fill("40")
    await expectTally(screen, "2 ways", true)
    await next(screen).click()

    await screen.getByRole("radio", { name: "Split it differently" }).click()
    await mode.getByRole("radio", { name: "Percent" }).click()
    await expectTally(screen, "100% left to assign", false)
    const percentFor = (name: string) =>
      screen.getByRole("textbox", { name: `Percent for ${name}` })
    await percentFor("you").fill("50")
    await percentFor("Ben").fill("29.5")
    await expectTally(screen, "20.5% left to assign", false)
    await expect.element(next(screen)).toBeDisabled()
    await percentFor("Cy").fill("20.5")
    await expectTally(screen, "3 ways", true)
    await next(screen).click()

    await expect.element(screen.getByText("You paid $60.00; Ben paid $40.00")).toBeVisible()
    await expect
      .element(screen.getByText("You owe $50.00; Ben owes $29.50; Cy owes $20.50"))
      .toBeVisible()
    await screen.getByRole("button", { name: "Add Expense" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 10_000,
        paid: { mode: "exact", ticked: ["ana"], exact: { ana: 6_000, ben: 4_000 }, percent: {} },
        owed: {
          mode: "percent",
          ticked: ["ben", "ana", "cy"],
          exact: {},
          percent: { ana: "50", ben: "29.5", cy: "20.5" },
        },
      }),
    )
  })

  test("Equally ticks who shares it, and nobody ticked blocks Next", async () => {
    const { screen } = await renderFlow()
    await fillWhat(screen)
    await next(screen).click()
    await next(screen).click()
    await screen.getByRole("radio", { name: "Split it differently" }).click()
    await expectTally(screen, "3 ways", true)

    await screen.getByRole("checkbox", { name: "Cy" }).click()
    await expectTally(screen, "2 ways", true)
    await expect.element(screen.getByText("$50.00").first()).toBeVisible()
    await screen.getByRole("checkbox", { name: "You" }).click()
    await screen.getByRole("checkbox", { name: "Ben" }).click()
    await expectTally(screen, "Tick at least one Member", false)
    await expect.element(next(screen)).toBeDisabled()
  })

  test("a one-tap answer keeps the editor's inputs, and Review names a side gone wrong", async () => {
    const { screen } = await renderFlow()
    await fillWhat(screen)
    await next(screen).click()
    await screen.getByRole("radio", { name: "Several people paid" }).click()
    await screen.getByRole("radio", { name: "Exact $" }).click()
    await screen.getByRole("textbox", { name: "Amount for you" }).fill("70")
    await screen.getByRole("textbox", { name: "Amount for Cy" }).fill("30")
    await screen.getByRole("radio", { name: "Ben paid it all" }).click()
    await expect
      .element(screen.getByRole("radiogroup", { name: "Split mode" }))
      .not.toBeInTheDocument()
    await screen.getByRole("radio", { name: "Several people paid" }).click()
    await expect
      .element(screen.getByRole("textbox", { name: "Amount for Cy" }))
      .toHaveValue("$30.00")
    await next(screen).click()
    await next(screen).click()

    await step(screen, "What").click()
    await screen.getByRole("textbox", { name: "Total" }).fill("120")
    await step(screen, "Review").click()
    await expect
      .element(screen.getByRole("list", { name: "Still to fix" }))
      .toHaveTextContent("Paid: $20.00 left to assign")
    await expect.element(screen.getByRole("button", { name: "Add Expense" })).toBeDisabled()
  })

  test("a negative total is a Refund, and the questions say so", async () => {
    const { screen, onSave } = await renderFlow()
    await screen.getByRole("textbox", { name: "Total" }).fill("-30")
    await screen.getByRole("textbox", { name: "Description" }).fill("Returned a lamp")
    await expect.element(screen.getByText(/A negative total is a Refund/)).toBeVisible()
    await next(screen).click()

    await expect
      .element(screen.getByRole("radiogroup", { name: "Who got the money back?" }))
      .toBeVisible()
    await expect.element(screen.getByRole("radio", { name: "You got it all back" })).toBeChecked()
    await next(screen).click()
    await expect
      .element(screen.getByRole("radiogroup", { name: "Who shares the Refund?" }))
      .toBeVisible()
    await next(screen).click()

    await expect.element(screen.getByText("-$30.00 (Refund)")).toBeVisible()
    await expect.element(screen.getByText("You got back $30.00")).toBeVisible()
    await expect.element(screen.getByText("You, Ben and Cy share $10.00 each")).toBeVisible()
    await screen.getByRole("button", { name: "Add Expense" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ total: -3_000, paid: equalSide(["ana"]) }),
    )
  })

  test("a Refund's exact amounts are typed without a minus", async () => {
    const { screen, onSave } = await renderFlow()
    await screen.getByRole("textbox", { name: "Total" }).fill("-30")
    await screen.getByRole("textbox", { name: "Description" }).fill("Returned a lamp")
    await next(screen).click()
    await next(screen).click()
    await screen.getByRole("radio", { name: "Split it differently" }).click()
    await screen.getByRole("radio", { name: "Exact $" }).click()
    const amountFor = (name: string) => screen.getByRole("textbox", { name: `Amount for ${name}` })
    // It starts from the current cents, as amounts.
    await expect.element(amountFor("Ben")).toHaveValue("$10.00")
    await amountFor("Ben").fill("-5")
    await expectTally(screen, "Enter each amount without a minus sign", false)
    await amountFor("Ben").fill("20")
    await expectTally(screen, "$10.00 over", false)
    await amountFor("Cy").fill("")
    await expectTally(screen, "2 ways", true)
    await next(screen).click()

    await expect.element(screen.getByText("You share $10.00; Ben shares $20.00")).toBeVisible()
    await screen.getByRole("button", { name: "Add Expense" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledOnce())
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        total: -3_000,
        owed: {
          mode: "exact",
          ticked: ["ben", "ana", "cy"],
          exact: { ben: 2_000, ana: 1_000, cy: null },
          percent: {},
        },
      }),
    )
  })
})

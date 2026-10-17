import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { ScheduleForm } from "@/apps/finances/schedules/schedule-form"
import type { NewSchedule } from "@/data/finances-schedules"

const CHECKING = "11111111-1111-7111-8111-111111111111"
const CARD = "22222222-2222-7222-8222-222222222222"
const { LANDLORD, HOUSING } = vi.hoisted(() => ({
  LANDLORD: "33333333-3333-7333-8333-333333333333",
  HOUSING: "44444444-4444-7444-8444-444444444444",
}))

// The real pickers read the live Account and Category collections; these stand-ins pick one.
vi.mock("@/apps/finances/pickers", async () => {
  const { createElement } = await import("react")
  function stub(name: string, pickedId: string) {
    return function Picker(props: { id?: string; onValueChange: (id: string | null) => void }) {
      return createElement(
        "button",
        { type: "button", id: props.id, onClick: () => props.onValueChange(pickedId) },
        `Pick ${name}`,
      )
    }
  }
  return { AccountPicker: stub("Account", LANDLORD), CategoryPicker: stub("Category", HOUSING) }
})

const WALLETS = [
  { id: CHECKING, name: "Test checking", shownAsOwed: false },
  { id: CARD, name: "Test card", shownAsOwed: true },
]

async function renderForm() {
  const onSave = vi.fn<(schedule: NewSchedule) => void>()
  const screen = await render(<ScheduleForm wallets={WALLETS} onSave={onSave} />)
  return { screen, onSave }
}

describe("ScheduleForm on a Wallet shown as owed", () => {
  test("takes the amount as the Wallet shows it: a charge adds to what's owed", async () => {
    const { screen, onSave } = await renderForm()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CARD)
    await expect.element(screen.getByRole("radio", { name: "Adds to what's owed" })).toBeChecked()
    await expect.element(screen.getByText("Money out")).not.toBeInTheDocument()
    await userEvent.fill(screen.getByLabelText("Amount"), "50")
    await userEvent.fill(screen.getByLabelText("Start date"), "2026-11-05")
    await screen.getByRole("button", { name: "Add Schedule" }).click()
    // Stored with its real sign: a charge is money out of the card.
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ walletId: CARD, amountCents: -5_000 }),
      ),
    )
  })

  test("a refund pays down what's owed and is stored as money in", async () => {
    const { screen, onSave } = await renderForm()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CARD)
    await screen.getByText("Pays down what's owed").click()
    await userEvent.fill(screen.getByLabelText("Amount"), "20")
    await screen.getByRole("button", { name: "Add Schedule" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2_000 })),
    )
  })

  test("switching Wallets keeps what was meant: money in on checking pays down the card", async () => {
    const { screen, onSave } = await renderForm()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CHECKING)
    await screen.getByText("Money in").click()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CARD)
    await expect.element(screen.getByRole("radio", { name: "Pays down what's owed" })).toBeChecked()
    await userEvent.fill(screen.getByLabelText("Amount"), "20")
    await screen.getByRole("button", { name: "Add Schedule" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2_000 })),
    )
  })
})

describe("ScheduleForm", () => {
  test("a monthly bill saves as money out with its Account and Category", async () => {
    const { screen, onSave } = await renderForm()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CHECKING)
    await userEvent.fill(screen.getByLabelText("Amount"), "1,500")
    await screen.getByText("Pick Account").click()
    await userEvent.fill(screen.getByLabelText("Start date"), "2026-11-01")
    await screen.getByText("Pick Category").click()
    await userEvent.fill(screen.getByLabelText("Note"), "  Lease  ")
    await screen.getByRole("button", { name: "Add Schedule" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        walletId: CHECKING,
        toWalletId: null,
        accountId: LANDLORD,
        amountCents: -150_000,
        unit: "month",
        every: 1,
        startDate: "2026-11-01",
        endDate: null,
        categoryId: HOUSING,
        note: "Lease",
      }),
    )
  })

  test("pay every 2 weeks saves as money in", async () => {
    const { screen, onSave } = await renderForm()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CHECKING)
    await screen.getByText("Money in").click()
    await userEvent.fill(screen.getByLabelText("Amount"), "2,000")
    await userEvent.fill(screen.getByLabelText("Every"), "2")
    await userEvent.selectOptions(screen.getByLabelText("Weeks or months"), "week")
    await userEvent.fill(screen.getByLabelText("Start date"), "2026-10-23")
    await userEvent.fill(screen.getByLabelText("End date (optional)"), "2027-10-22")
    await screen.getByRole("button", { name: "Add Schedule" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 200_000,
          unit: "week",
          every: 2,
          startDate: "2026-10-23",
          endDate: "2027-10-22",
        }),
      ),
    )
  })

  test("a Transfer moves a positive amount to another Wallet and has no Category", async () => {
    const { screen, onSave } = await renderForm()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CHECKING)
    // A Category picked first is dropped once it becomes a Transfer.
    await screen.getByText("Pick Category").click()
    await screen.getByText("A Transfer to a Wallet").click()
    await expect.element(screen.getByText("Pick Category")).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText("Transfer to"), CARD)
    await userEvent.fill(screen.getByLabelText("Amount"), "200")
    await userEvent.fill(screen.getByLabelText("Start date"), "2026-11-20")
    await screen.getByRole("button", { name: "Add Schedule" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: CHECKING,
          toWalletId: CARD,
          amountCents: 20_000,
          categoryId: null,
        }),
      ),
    )
  })

  test("a Transfer to its own Wallet, or with no amount, is not saved", async () => {
    const { screen, onSave } = await renderForm()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CARD)
    await screen.getByText("A Transfer to a Wallet").click()
    await userEvent.selectOptions(screen.getByLabelText("Transfer to"), CARD)
    await screen.getByRole("button", { name: "Add Schedule" }).click()
    await expect.element(screen.getByText("Pick a different Wallet")).toBeVisible()
    await expect.element(screen.getByText("Enter an amount like 1,500.00")).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  test("an end date before the start is not saved", async () => {
    const { screen, onSave } = await renderForm()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CHECKING)
    await userEvent.fill(screen.getByLabelText("Amount"), "10")
    await userEvent.fill(screen.getByLabelText("Start date"), "2026-11-01")
    await userEvent.fill(screen.getByLabelText("End date (optional)"), "2026-10-01")
    await screen.getByRole("button", { name: "Add Schedule" }).click()
    await expect
      .element(screen.getByText("The end date can't be before the start date"))
      .toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })
})

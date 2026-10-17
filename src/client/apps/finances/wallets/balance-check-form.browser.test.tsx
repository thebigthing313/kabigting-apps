import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import {
  type BalanceCheckEntry,
  BalanceCheckForm,
} from "@/apps/finances/wallets/balance-check-form"
import type { Wallet } from "@/data/finances-wallets"
import { today } from "@shared/dates"

function wallet(id: string, name: string, shownAsOwed: boolean): Wallet {
  return {
    id,
    name,
    inForecast: false,
    lowBalanceThresholdCents: 0,
    shownAsOwed,
    bankAccountLast4: null,
    archived: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  }
}

const checking = wallet("0190f5d2-0000-7000-8000-000000000001", "Test checking", false)
const card = wallet("0190f5d2-0000-7000-8000-000000000002", "Test card", true)

describe("BalanceCheckForm", () => {
  test("starts on the given Wallet and today, and saves the balance as typed", async () => {
    const onSave = vi.fn<(entry: BalanceCheckEntry) => void>()
    const screen = await render(
      <BalanceCheckForm wallets={[checking, card]} walletId={checking.id} onSave={onSave} />,
    )
    await expect.element(screen.getByLabelText("Date")).toHaveValue(today())
    await userEvent.fill(screen.getByLabelText("Date"), "2026-10-05")
    await userEvent.fill(screen.getByLabelText("Balance"), "1,250.50")
    await screen.getByRole("button", { name: "Save Balance check" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        walletId: checking.id,
        date: "2026-10-05",
        amountCents: 125_050,
      }),
    )
  })

  test("a Wallet shown as owed takes the amount owed and stores it as a negative balance", async () => {
    const onSave = vi.fn<(entry: BalanceCheckEntry) => void>()
    const screen = await render(<BalanceCheckForm wallets={[checking, card]} onSave={onSave} />)
    await screen.getByLabelText("Wallet").selectOptions("Test card")
    await expect.element(screen.getByText("The amount owed, as the bank shows it.")).toBeVisible()
    await userEvent.fill(screen.getByLabelText("Balance"), "400")
    await screen.getByRole("button", { name: "Save Balance check" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        walletId: card.id,
        date: today(),
        amountCents: -40_000,
      }),
    )
  })

  test("without a Wallet or an Amount nothing is saved", async () => {
    const onSave = vi.fn<(entry: BalanceCheckEntry) => void>()
    const screen = await render(<BalanceCheckForm wallets={[checking]} onSave={onSave} />)
    await screen.getByRole("button", { name: "Save Balance check" }).click()
    await expect.element(screen.getByText("Pick a Wallet", { exact: true }).last()).toBeVisible()
    await expect.element(screen.getByText(/Enter the balance like/)).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })
})

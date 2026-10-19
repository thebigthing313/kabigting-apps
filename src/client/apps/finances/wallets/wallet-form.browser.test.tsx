import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { WalletForm } from "@/apps/finances/wallets/wallet-form"
import type { WalletSettings } from "@/data/finances-wallets"

const card: WalletSettings = {
  name: "Test card",
  inForecast: false,
  lowBalanceThresholdCents: -500_000,
  shownAsOwed: true,
}

describe("WalletForm", () => {
  test("a new Wallet saves its name and settings", async () => {
    const onSave = vi.fn<(settings: WalletSettings) => void>()
    const screen = await render(<WalletForm submitLabel="Add Wallet" onSave={onSave} />)
    await userEvent.fill(screen.getByLabelText("Name"), "  Test checking  ")
    await screen.getByText("In the forecast", { exact: true }).click()
    await userEvent.fill(screen.getByLabelText("Low-balance threshold"), "250")
    await screen.getByRole("button", { name: "Add Wallet" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: "Test checking",
        inForecast: true,
        lowBalanceThresholdCents: 25_000,
        shownAsOwed: false,
      }),
    )
  })

  test("a Wallet shown as owed shows and takes the threshold as an amount owed", async () => {
    const onSave = vi.fn<(settings: WalletSettings) => void>()
    const screen = await render(<WalletForm initial={card} submitLabel="Save" onSave={onSave} />)
    await expect.element(screen.getByLabelText("Most owed")).toHaveValue("$5,000.00")
    await expect
      .element(screen.getByText("Warn when the amount owed goes above this. $0 means no warning."))
      .toBeVisible()
    await userEvent.fill(screen.getByLabelText("Most owed"), "6,000")
    await screen.getByRole("button", { name: "Save" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ ...card, lowBalanceThresholdCents: -600_000 }),
    )
  })

  test("turning on shown as owed flips the shown threshold, not the stored one", async () => {
    const onSave = vi.fn<(settings: WalletSettings) => void>()
    const screen = await render(
      <WalletForm
        initial={{ ...card, shownAsOwed: false, lowBalanceThresholdCents: 10_000 }}
        submitLabel="Save"
        onSave={onSave}
      />,
    )
    await screen.getByText("Shown as owed", { exact: true }).click()
    await expect.element(screen.getByLabelText("Most owed")).toHaveValue("-$100.00")
    await screen.getByText("Shown as owed", { exact: true }).click()
    await expect.element(screen.getByLabelText("Low-balance threshold")).toHaveValue("$100.00")
    await expect.element(screen.getByText("Warn when the balance goes below this.")).toBeVisible()
    await screen.getByText("Shown as owed", { exact: true }).click()
    await screen.getByRole("button", { name: "Save" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        ...card,
        shownAsOwed: true,
        lowBalanceThresholdCents: 10_000,
      }),
    )
  })

  test("an empty name is not saved", async () => {
    const onSave = vi.fn<(settings: WalletSettings) => void>()
    const screen = await render(<WalletForm submitLabel="Add Wallet" onSave={onSave} />)
    await screen.getByRole("button", { name: "Add Wallet" }).click()
    await expect.element(screen.getByText("Give the Wallet a name")).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })
})

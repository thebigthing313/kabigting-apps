import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { TransactionForm } from "@/apps/finances/transactions/transaction-form"
import type { NewTransaction } from "@/data/finances-transactions"
import type { NewTransfer } from "@/data/finances-transfers"
import { today } from "@shared/dates"

const CHECKING = "11111111-1111-7111-8111-111111111111"
const CARD = "22222222-2222-7222-8222-222222222222"
const { GROCER, GROCERIES } = vi.hoisted(() => ({
  GROCER: "33333333-3333-7333-8333-333333333333",
  GROCERIES: "44444444-4444-7444-8444-444444444444",
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
  return { AccountPicker: stub("Account", GROCER), CategoryPicker: stub("Category", GROCERIES) }
})

const WALLETS = [
  { id: CHECKING, name: "Test checking", shownAsOwed: false },
  { id: CARD, name: "Test card", shownAsOwed: true },
]

function saver() {
  return vi.fn<(entry: NewTransaction) => void>()
}

describe("TransactionForm adding", () => {
  test("starts on the given Wallet, today and money out, and saves an Actual", async () => {
    const onSave = saver()
    const screen = await render(
      <TransactionForm wallets={WALLETS} status="actual" walletId={CHECKING} onSave={onSave} />,
    )
    await expect.element(screen.getByLabelText("Wallet")).toHaveValue(CHECKING)
    await expect.element(screen.getByLabelText("Date")).toHaveValue(today())
    await expect.element(screen.getByRole("radio", { name: "Actual" })).toBeChecked()
    await expect.element(screen.getByRole("radio", { name: "Money out" })).toBeChecked()
    await userEvent.fill(screen.getByLabelText("Date"), "2026-10-05")
    await userEvent.fill(screen.getByLabelText("Amount"), "42.50")
    await screen.getByText("Pick Account").click()
    await screen.getByText("Pick Category").click()
    await userEvent.fill(screen.getByLabelText("Note"), "  Made-up groceries ")
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        status: "actual",
        walletId: CHECKING,
        date: "2026-10-05",
        amountCents: -4_250,
        accountId: GROCER,
        categoryId: GROCERIES,
        note: "Made-up groceries",
      }),
    )
  })

  test("a one-off Planned of money in is stored positive", async () => {
    const onSave = saver()
    const screen = await render(
      <TransactionForm wallets={WALLETS} status="actual" walletId={CHECKING} onSave={onSave} />,
    )
    await screen.getByText("Planned", { exact: true }).click()
    await screen.getByText("Money in").click()
    await userEvent.fill(screen.getByLabelText("Amount"), "1,500")
    await screen.getByRole("button", { name: "Add Planned" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ status: "planned", amountCents: 150_000, accountId: null }),
      ),
    )
  })

  test("on a Wallet shown as owed a charge adds to what's owed and is stored as money out", async () => {
    const onSave = saver()
    const screen = await render(
      <TransactionForm wallets={WALLETS} status="actual" walletId={CARD} onSave={onSave} />,
    )
    await expect.element(screen.getByRole("radio", { name: "Adds to what's owed" })).toBeChecked()
    await userEvent.fill(screen.getByLabelText("Amount"), "50")
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ walletId: CARD, amountCents: -5_000 }),
      ),
    )
  })

  test("switching to a Wallet shown as owed keeps the direction that was meant", async () => {
    const onSave = saver()
    const screen = await render(
      <TransactionForm wallets={WALLETS} status="actual" walletId={CHECKING} onSave={onSave} />,
    )
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CARD)
    await expect.element(screen.getByRole("radio", { name: "Adds to what's owed" })).toBeChecked()
  })

  test("without a Wallet, or with no Amount or a zero one, nothing is saved", async () => {
    const onSave = saver()
    const screen = await render(
      <TransactionForm wallets={WALLETS} status="actual" onSave={onSave} />,
    )
    await userEvent.fill(screen.getByLabelText("Amount"), "0")
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await expect.element(screen.getByText("Pick a Wallet", { exact: true }).last()).toBeVisible()
    await expect.element(screen.getByText(/Enter an amount like/)).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })
})

function transferSaver() {
  return vi.fn<(entry: NewTransfer) => void>()
}

describe("TransactionForm entering a Transfer", () => {
  test("Transfer to… saves a positive amount from the Wallet to the other, with no Category", async () => {
    const onSave = saver()
    const onSaveTransfer = transferSaver()
    const screen = await render(
      <TransactionForm
        wallets={WALLETS}
        status="actual"
        walletId={CHECKING}
        onSave={onSave}
        onSaveTransfer={onSaveTransfer}
      />,
    )
    await screen.getByText("Transfer to…").click()
    await expect.element(screen.getByRole("radio", { name: "Money out" })).not.toBeInTheDocument()
    await expect.element(screen.getByText("Pick Category")).not.toBeInTheDocument()
    await expect.element(screen.getByText(/A Transfer has no Category/)).toBeVisible()
    await userEvent.selectOptions(screen.getByLabelText("To Wallet"), CARD)
    await userEvent.fill(screen.getByLabelText("Date"), "2026-10-05")
    await userEvent.fill(screen.getByLabelText("Amount"), "250")
    await userEvent.fill(screen.getByLabelText("Note"), "Made-up card payment")
    await screen.getByRole("button", { name: "Add Actual Transfer" }).click()
    await vi.waitFor(() =>
      expect(onSaveTransfer).toHaveBeenCalledWith({
        status: "actual",
        fromWalletId: CHECKING,
        toWalletId: CARD,
        date: "2026-10-05",
        amountCents: 25_000,
        accountId: null,
        note: "Made-up card payment",
      }),
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  test("a Planned Transfer needs a different Wallet to go to", async () => {
    const onSaveTransfer = transferSaver()
    const screen = await render(
      <TransactionForm
        wallets={WALLETS}
        status="planned"
        walletId={CHECKING}
        onSaveTransfer={onSaveTransfer}
      />,
    )
    await screen.getByText("Transfer to…").click()
    await userEvent.fill(screen.getByLabelText("Amount"), "10")
    await screen.getByRole("button", { name: "Add Planned Transfer" }).click()
    await expect.element(screen.getByText("Pick a Wallet", { exact: true }).last()).toBeVisible()
    await userEvent.selectOptions(screen.getByLabelText("To Wallet"), CHECKING)
    await screen.getByRole("button", { name: "Add Planned Transfer" }).click()
    await expect.element(screen.getByText("Pick a different Wallet")).toBeVisible()
    expect(onSaveTransfer).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByLabelText("To Wallet"), CARD)
    await screen.getByRole("button", { name: "Add Planned Transfer" }).click()
    await vi.waitFor(() =>
      expect(onSaveTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ status: "planned", toWalletId: CARD, amountCents: 1_000 }),
      ),
    )
  })

  test("without a way to save a Transfer, it is not offered", async () => {
    const screen = await render(
      <TransactionForm wallets={WALLETS} status="actual" walletId={CHECKING} onSave={saver()} />,
    )
    await expect.element(screen.getByText("Transfer to…")).not.toBeInTheDocument()
  })

  test("editing a Transfer shows its Wallets and amount and saves the changes", async () => {
    const onSaveTransfer = transferSaver()
    const transfer = {
      status: "planned" as const,
      fromWalletId: CHECKING,
      toWalletId: CARD,
      date: "2026-10-20",
      amountCents: 25_000,
      accountId: null,
      note: "",
    }
    const screen = await render(
      <TransactionForm
        wallets={WALLETS}
        initialTransfer={transfer}
        onSaveTransfer={onSaveTransfer}
      />,
    )
    await expect.element(screen.getByText("Transfer to…")).not.toBeInTheDocument()
    await expect.element(screen.getByLabelText("From Wallet")).toHaveValue(CHECKING)
    await expect.element(screen.getByLabelText("To Wallet")).toHaveValue(CARD)
    await expect.element(screen.getByLabelText("Amount")).toHaveValue("$250.00")
    await userEvent.fill(screen.getByLabelText("Amount"), "300")
    await screen.getByRole("button", { name: "Save changes" }).click()
    await vi.waitFor(() =>
      expect(onSaveTransfer).toHaveBeenCalledWith({ ...transfer, amountCents: 30_000 }),
    )
  })
})

describe("TransactionForm editing", () => {
  const row = {
    status: "actual" as const,
    walletId: CARD,
    date: "2026-10-03",
    amountCents: -5_000,
    accountId: null,
    categoryId: null,
    note: "Made-up charge",
  }

  test("shows the row as its Wallet shows it and saves every field", async () => {
    const onSave = saver()
    const screen = await render(<TransactionForm wallets={WALLETS} initial={row} onSave={onSave} />)
    await expect.element(screen.getByRole("radio", { name: "Actual" })).not.toBeInTheDocument()
    await expect.element(screen.getByLabelText("Amount")).toHaveValue("$50.00")
    await expect.element(screen.getByRole("radio", { name: "Adds to what's owed" })).toBeChecked()
    await userEvent.selectOptions(screen.getByLabelText("Wallet"), CHECKING)
    await userEvent.fill(screen.getByLabelText("Date"), "2026-10-04")
    await userEvent.fill(screen.getByLabelText("Amount"), "60")
    await screen.getByText("Pick Category").click()
    await screen.getByRole("button", { name: "Save changes" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        ...row,
        walletId: CHECKING,
        date: "2026-10-04",
        amountCents: -6_000,
        categoryId: GROCERIES,
      }),
    )
  })

  test("an imported Actual keeps its amount, date and Wallet", async () => {
    const onSave = saver()
    const screen = await render(
      <TransactionForm wallets={WALLETS} initial={row} locked onSave={onSave} />,
    )
    await expect.element(screen.getByLabelText("Wallet")).toBeDisabled()
    await expect.element(screen.getByLabelText("Date")).toBeDisabled()
    await expect.element(screen.getByLabelText("Amount")).toBeDisabled()
    await userEvent.fill(screen.getByLabelText("Note"), "Relabelled")
    await screen.getByRole("button", { name: "Save changes" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith({ ...row, note: "Relabelled" }))
  })
})

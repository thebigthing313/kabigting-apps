import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { type MatchesProps, TransactionForm } from "@/apps/finances/transactions/transaction-form"
import type { NewTransaction } from "@/data/finances-transactions"
import { today } from "@shared/dates"
import type { PlannedItem } from "@shared/finances/reconcile"

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
  return vi.fn<(entry: NewTransaction, match: PlannedItem | null) => void>()
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
      expect(onSave).toHaveBeenCalledWith(
        {
          status: "actual",
          walletId: CHECKING,
          date: "2026-10-05",
          amountCents: -4_250,
          accountId: GROCER,
          categoryId: GROCERIES,
          note: "Made-up groceries",
        },
        null,
      ),
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
        null,
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
        null,
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
      expect(onSave).toHaveBeenCalledWith(
        {
          ...row,
          walletId: CHECKING,
          date: "2026-10-04",
          amountCents: -6_000,
          categoryId: GROCERIES,
        },
        null,
      ),
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
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ ...row, note: "Relabelled" }, null),
    )
  })
})

describe("TransactionForm suggested matches", () => {
  const rent: PlannedItem = {
    kind: "occurrence",
    scheduleId: "55555555-5555-7555-8555-555555555555",
    nominalDate: "2026-10-01",
    walletId: CHECKING,
    date: "2026-10-01",
    amountCents: -4_000,
    accountId: null,
    categoryId: null,
  }

  /** Stands in for the live suggestions: shows what it was asked about and offers one match. */
  function Matches({ walletId, amountCents, selected, onSelect }: MatchesProps) {
    return (
      <div>
        <p>
          Matches for {walletId === CHECKING ? "checking" : "card"} {amountCents}
        </p>
        <button type="button" onClick={() => onSelect(selected ? null : rent)}>
          {selected ? "Untick rent" : "Tick rent"}
        </button>
      </div>
    )
  }

  async function typed(onSave = saver()) {
    const screen = await render(
      <TransactionForm
        wallets={WALLETS}
        status="actual"
        walletId={CHECKING}
        matches={Matches}
        onSave={onSave}
      />,
    )
    await userEvent.fill(screen.getByLabelText("Date"), "2026-10-02")
    await userEvent.fill(screen.getByLabelText("Amount"), "42.50")
    return screen
  }

  test("are asked for once an Amount is typed, and the ticked one is saved with the Actual", async () => {
    const onSave = saver()
    const screen = await render(
      <TransactionForm
        wallets={WALLETS}
        status="actual"
        walletId={CHECKING}
        matches={Matches}
        onSave={onSave}
      />,
    )
    await expect.element(screen.getByText(/Matches for/)).not.toBeInTheDocument()
    await userEvent.fill(screen.getByLabelText("Date"), "2026-10-02")
    await userEvent.fill(screen.getByLabelText("Amount"), "42.50")
    await expect.element(screen.getByText("Matches for checking -4250")).toBeVisible()
    await screen.getByRole("button", { name: "Tick rent" }).click()
    await expect.element(screen.getByRole("button", { name: "Untick rent" })).toBeVisible()
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: -4_250, date: "2026-10-02" }),
        rent,
      ),
    )
  })

  test("a tick that no longer suits the Actual, such as after a change of sign, is dropped", async () => {
    const onSave = saver()
    const screen = await typed(onSave)
    await screen.getByRole("button", { name: "Tick rent" }).click()
    await screen.getByText("Money in").click()
    await screen.getByRole("button", { name: "Add Actual" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 4_250 }), null),
    )
  })

  test("a Planned item gets no suggestions", async () => {
    const screen = await typed()
    await screen.getByText("Planned", { exact: true }).click()
    await expect.element(screen.getByText(/Matches for/)).not.toBeInTheDocument()
  })
})

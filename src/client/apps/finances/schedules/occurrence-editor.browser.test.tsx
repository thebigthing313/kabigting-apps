import { describe, expect, test, vi } from "vitest"
import { userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { OccurrenceEditor, type EditedSchedule } from "@/apps/finances/schedules/occurrence-editor"
import type { Occurrence, OccurrenceOverride } from "@shared/finances/occurrences"

const CARD = "22222222-2222-7222-8222-222222222222"

const CHECKING = { shownAsOwed: false }
const OWED = { shownAsOwed: true }

/** Made-up rent: $1,500.00 out of checking on the 1st. */
const RENT: EditedSchedule = {
  unit: "month",
  every: 1,
  startDate: "2026-11-01",
  endDate: null,
  amountCents: -150_000,
  toWalletId: null,
}

/** A made-up card payment: $200.00 from checking to the card on the 20th. */
const CARD_PAYMENT: EditedSchedule = {
  ...RENT,
  startDate: "2026-11-20",
  amountCents: 20_000,
  toWalletId: CARD,
}

function untouched(schedule: EditedSchedule, nominalDate: string): Occurrence {
  return { nominalDate, date: nominalDate, amountCents: schedule.amountCents, state: "upcoming" }
}

async function renderEditor(props: {
  schedule: EditedSchedule
  occurrence: Occurrence
  wallet?: { shownAsOwed: boolean }
  toWallet?: { shownAsOwed: boolean }
  overridden?: boolean
}) {
  const onSave = vi.fn<(override: OccurrenceOverride | null) => void>()
  const screen = await render(
    <OccurrenceEditor
      schedule={props.schedule}
      occurrence={props.occurrence}
      wallet={props.wallet ?? CHECKING}
      toWallet={props.toWallet}
      overridden={props.overridden ?? false}
      onSave={onSave}
      onCancel={() => {}}
    />,
  )
  return { screen, onSave }
}

describe("OccurrenceEditor", () => {
  test("saves a new amount and date as an override, keeping the Schedule's sign", async () => {
    const { screen, onSave } = await renderEditor({
      schedule: RENT,
      occurrence: untouched(RENT, "2026-12-01"),
    })
    await expect.element(screen.getByLabelText("Amount")).toHaveValue("$1,500.00")
    await expect.element(screen.getByText("Money out")).toBeVisible()
    await userEvent.fill(screen.getByLabelText("Amount"), "1,575")
    await userEvent.fill(screen.getByLabelText("Date"), "2026-12-03")
    await screen.getByRole("button", { name: "Save" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        overrideAmountCents: -157_500,
        overrideDate: "2026-12-03",
        skipped: false,
      }),
    )
  })

  test("saving the Schedule's own terms stores nothing", async () => {
    const { screen, onSave } = await renderEditor({
      schedule: RENT,
      occurrence: untouched(RENT, "2026-12-01"),
    })
    await screen.getByRole("button", { name: "Save" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(null))
  })

  test("refuses an empty amount", async () => {
    const { screen, onSave } = await renderEditor({
      schedule: RENT,
      occurrence: untouched(RENT, "2026-12-01"),
    })
    await userEvent.fill(screen.getByLabelText("Amount"), "")
    await screen.getByRole("button", { name: "Save" }).click()
    await expect.element(screen.getByText(/Enter an amount/)).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  test("Skip keeps any override", async () => {
    const moved: Occurrence = { ...untouched(RENT, "2026-12-01"), date: "2026-12-02" }
    const { screen, onSave } = await renderEditor({
      schedule: RENT,
      occurrence: moved,
      overridden: true,
    })
    await screen.getByRole("button", { name: "Skip" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        overrideAmountCents: null,
        overrideDate: "2026-12-02",
        skipped: true,
      }),
    )
  })

  test("Unskip restores a skipped Occurrence", async () => {
    const { screen, onSave } = await renderEditor({
      schedule: RENT,
      occurrence: { ...untouched(RENT, "2026-12-01"), state: "skipped" },
    })
    await expect.element(screen.getByRole("button", { name: "Skip" })).not.toBeInTheDocument()
    await screen.getByRole("button", { name: "Unskip" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(null))
  })

  test("Back to schedule isn't offered for an untouched Occurrence", async () => {
    const { screen } = await renderEditor({
      schedule: RENT,
      occurrence: untouched(RENT, "2026-12-01"),
    })
    await expect.element(screen.getByRole("button", { name: "Save" })).toBeVisible()
    await expect
      .element(screen.getByRole("button", { name: "Back to schedule" }))
      .not.toBeInTheDocument()
  })

  test("Back to schedule drops an override", async () => {
    const { screen, onSave } = await renderEditor({
      schedule: RENT,
      occurrence: { ...untouched(RENT, "2026-12-01"), amountCents: -1 },
      overridden: true,
    })
    await screen.getByRole("button", { name: "Back to schedule" }).click()
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith(null))
  })

  test("Back to schedule on a skipped override keeps it skipped", async () => {
    const { screen, onSave } = await renderEditor({
      schedule: RENT,
      occurrence: { ...untouched(RENT, "2026-12-01"), amountCents: -1, state: "skipped" },
      overridden: true,
    })
    await screen.getByRole("button", { name: "Back to schedule" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        overrideAmountCents: null,
        overrideDate: null,
        skipped: true,
      }),
    )
  })

  test("on a Wallet shown as owed, the amount is typed as the Wallet shows it", async () => {
    const charge: EditedSchedule = { ...RENT, amountCents: -5_000 }
    const { screen, onSave } = await renderEditor({
      schedule: charge,
      occurrence: untouched(charge, "2026-12-01"),
      wallet: OWED,
    })
    await expect.element(screen.getByLabelText("Amount")).toHaveValue("$50.00")
    await expect.element(screen.getByText("Adds to what's owed")).toBeVisible()
    await userEvent.fill(screen.getByLabelText("Amount"), "65")
    await screen.getByRole("button", { name: "Save" }).click()
    // Stored with its real sign: a charge is money out of the card.
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ overrideAmountCents: -6_500 })),
    )
  })

  test("a Transfer into a Wallet shown as owed reads Statement balance and Due date", async () => {
    const { screen, onSave } = await renderEditor({
      schedule: CARD_PAYMENT,
      occurrence: untouched(CARD_PAYMENT, "2026-12-20"),
      toWallet: OWED,
    })
    await expect.element(screen.getByLabelText("Amount")).not.toBeInTheDocument()
    await userEvent.fill(screen.getByLabelText("Statement balance"), "482.10")
    await userEvent.fill(screen.getByLabelText("Due date"), "2026-12-18")
    await screen.getByRole("button", { name: "Save" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        overrideAmountCents: 48_210,
        overrideDate: "2026-12-18",
        skipped: false,
      }),
    )
  })

  test("a Transfer into an ordinary Wallet keeps the Amount and Date labels", async () => {
    const { screen } = await renderEditor({
      schedule: CARD_PAYMENT,
      occurrence: untouched(CARD_PAYMENT, "2026-12-20"),
      toWallet: CHECKING,
    })
    await expect.element(screen.getByLabelText("Amount")).toBeVisible()
    await expect.element(screen.getByLabelText("Date")).toBeVisible()
    await expect.element(screen.getByText("Statement balance")).not.toBeInTheDocument()
  })
})

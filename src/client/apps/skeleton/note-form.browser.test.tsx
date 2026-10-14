import { describe, expect, test, vi } from "vitest"
import { page, userEvent } from "vitest/browser"
import { render } from "vitest-browser-react"
import { NoteForm } from "@/apps/skeleton/note-form"
import type { NoteInput } from "@/data/skeleton-notes"

describe("NoteForm (TanStack Form with Zod 4)", () => {
  test("submits a valid note as cents and a calendar date", async () => {
    const onSave = vi.fn<(note: NoteInput) => void>()
    const screen = await render(
      <NoteForm
        submitLabel="Add note"
        onSave={onSave}
        initial={{ text: "", amountCents: 0, onDate: "2026-10-14" }}
      />,
    )
    await userEvent.fill(screen.getByLabelText("Note"), "  Groceries  ")
    await userEvent.fill(screen.getByLabelText("Amount"), "-45.20")
    await screen.getByRole("button", { name: "Add note" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        text: "Groceries",
        amountCents: -4520,
        onDate: "2026-10-14",
      }),
    )
  })

  test("shows field errors and does not save an empty form", async () => {
    const onSave = vi.fn<(note: NoteInput) => void>()
    const screen = await render(<NoteForm submitLabel="Add note" onSave={onSave} />)
    await screen.getByRole("button", { name: "Add note" }).click()
    await expect.element(screen.getByText("Write a note")).toBeVisible()
    await expect.element(screen.getByText(/Enter an amount like 1,250.50/)).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  test("picks a date from the calendar", async () => {
    const onSave = vi.fn<(note: NoteInput) => void>()
    const screen = await render(
      <NoteForm
        submitLabel="Save"
        onSave={onSave}
        initial={{ text: "Rent", amountCents: -150000, onDate: "2026-11-01" }}
      />,
    )
    const dateButton = screen.getByLabelText("Date")
    await expect.element(dateButton).toHaveTextContent("Nov 1, 2026")
    await dateButton.click()
    // The calendar opens in a portal, outside the rendered container.
    await page.getByRole("button", { name: /November 15/ }).click()
    await expect.element(dateButton).toHaveTextContent("Nov 15, 2026")
    await screen.getByRole("button", { name: "Save" }).click()
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        text: "Rent",
        amountCents: -150000,
        onDate: "2026-11-15",
      }),
    )
  })
})

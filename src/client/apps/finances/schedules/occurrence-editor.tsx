import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  overrideFor,
  type Occurrence,
  type OccurrenceOverride,
  type ScheduleTerms,
} from "@shared/finances/occurrences"
import { fromShown, toShown } from "@shared/finances/wallets"

/** The Schedule an edited Occurrence belongs to: its terms, and where a Transfer goes. */
export type EditedSchedule = ScheduleTerms & { toWalletId: string | null }

type Shown = { shownAsOwed: boolean }

const editorSchema = z.object({
  amount: z
    .int()
    .nullable()
    .refine((cents) => cents !== null && cents !== 0, "Enter an amount like 1,500.00"),
  date: z.iso.date("Pick a date"),
})

/**
 * Edits one Occurrence in place: a new amount or date, Skip or Unskip, or Back to schedule. It
 * reports what to store, or null when the Occurrence is back on its Schedule's terms. Amounts are
 * typed as the Wallet shows them (D15); a card payment's read Statement balance and Due date.
 */
export function OccurrenceEditor({
  schedule,
  occurrence,
  wallet,
  toWallet,
  overridden,
  onSave,
  onCancel,
}: {
  schedule: EditedSchedule
  occurrence: Occurrence
  /** The Wallet the Schedule draws on. */
  wallet: Shown
  /** A Transfer's other Wallet. */
  toWallet: Shown | undefined
  /** Whether its amount or date is overridden, so it can go back to the Schedule's. */
  overridden: boolean
  /** May return a promise; the buttons stay disabled until it settles. */
  onSave: (override: OccurrenceOverride | null) => void | Promise<unknown>
  onCancel: () => void
}) {
  const transfer = schedule.toWalletId !== null
  const cardPayment = transfer && toWallet?.shownAsOwed === true
  const amountLabel = cardPayment ? "Statement balance" : "Amount"
  const dateLabel = cardPayment ? "Due date" : "Date"
  // A Transfer moves a positive amount. A Transaction is typed as a size, in the direction it
  // already goes as its Wallet shows it.
  const shownNegative = !transfer && toShown(wallet, occurrence.amountCents) < 0
  const direction = transfer
    ? undefined
    : wallet.shownAsOwed
      ? shownNegative
        ? "Pays down what's owed"
        : "Adds to what's owed"
      : shownNegative
        ? "Money out"
        : "Money in"
  const skipped = occurrence.state === "skipped"

  const store = (amountCents: number, date: string, skip: boolean) =>
    onSave(overrideFor(schedule, occurrence.nominalDate, { amountCents, date, skipped: skip }))

  const defaultValues: { amount: number | null; date: string } = {
    amount: Math.abs(occurrence.amountCents),
    date: occurrence.date,
  }
  const form = useForm({
    defaultValues,
    validators: { onSubmit: editorSchema },
    onSubmit: async ({ value }) => {
      const size = Math.abs(value.amount ?? 0)
      const amountCents = transfer ? size : fromShown(wallet, shownNegative ? -size : size)
      await store(amountCents, value.date, skipped)
    },
  })

  const idPrefix = `occurrence-${occurrence.nominalDate}`

  return (
    <form
      noValidate
      aria-label={`Edit the Occurrence on ${occurrence.nominalDate}`}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <form.Field name="amount">
            {(field) => {
              const invalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={`${idPrefix}-amount`}>{amountLabel}</FieldLabel>
                  <AmountInput
                    id={`${idPrefix}-amount`}
                    name={field.name}
                    className="h-11"
                    value={field.state.value}
                    onValueChange={field.handleChange}
                    onBlur={field.handleBlur}
                    aria-invalid={invalid || undefined}
                  />
                  {direction ? <FieldDescription>{direction}</FieldDescription> : null}
                  {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                </Field>
              )
            }}
          </form.Field>
          <form.Field name="date">
            {(field) => {
              const invalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor={`${idPrefix}-date`}>{dateLabel}</FieldLabel>
                  <Input
                    id={`${idPrefix}-date`}
                    type="date"
                    className="h-11"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={invalid || undefined}
                  />
                  {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                </Field>
              )
            }}
          </form.Field>
        </div>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="h-11" disabled={isSubmitting}>
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={isSubmitting}
                onClick={() => void store(occurrence.amountCents, occurrence.date, !skipped)}
              >
                {skipped ? "Unskip" : "Skip"}
              </Button>
              {overridden ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={isSubmitting}
                  // Drops the override; a skip stays until Unskip.
                  onClick={() =>
                    void onSave(
                      skipped ? { overrideAmountCents: null, overrideDate: null, skipped } : null,
                    )
                  }
                >
                  Back to schedule
                </Button>
              ) : null}
              <Button type="button" variant="ghost" className="h-11" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

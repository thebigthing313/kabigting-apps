import { useForm } from "@tanstack/react-form"
import { z } from "zod"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  OverridesToDelete,
  ReconciledInTheWay,
} from "@/apps/finances/schedules/overrides-to-delete"
import { Input } from "@/components/ui/input"
import type { Schedule } from "@/data/finances-schedules"
import { addDays, formatDisplayDate } from "@shared/dates"
import { overridesOffNewTerms, reconciledFrom } from "@shared/finances/occurrences"
import type { ChangeScheduleFrom, OccurrenceRow } from "@shared/finances/schemas"
import { fromShown, toShown } from "@shared/finances/wallets"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isDate(value: string): boolean {
  return ISO_DATE.test(value)
}

type ChangeFromValues = {
  /** The first day on the new terms; the Schedule ends the day before. */
  from: string
  /** As typed; the direction stays as it was. */
  amount: number | null
  every: string
  unit: "week" | "month"
  /** The new terms' first Occurrence; empty means the change date. */
  startDate: string
  endDate: string
}

function changeFromSchema(schedule: Pick<Schedule, "startDate" | "endDate">) {
  return z
    .object({
      from: z.iso.date("Pick a date"),
      amount: z
        .int()
        .nullable()
        .refine((cents) => cents !== null && cents !== 0, "Enter an amount like 1,500.00"),
      every: z.string().regex(/^[1-9]\d{0,2}$/, "Enter a whole number from 1 to 999"),
      unit: z.enum(["week", "month"]),
      startDate: z.union([z.literal(""), z.iso.date("Pick a date or leave it empty")]),
      endDate: z.union([z.literal(""), z.iso.date("Pick an end date or leave it empty")]),
    })
    .superRefine((values, context) => {
      const issue = (path: string, message: string) =>
        context.addIssue({ code: "custom", path: [path], message })
      if (values.from <= schedule.startDate) {
        issue("from", "Pick a date after the Schedule starts")
      }
      if (schedule.endDate !== null && values.from > schedule.endDate) {
        issue("from", "Pick a date on or before the Schedule ends")
      }
      if (values.startDate !== "" && values.startDate < values.from) {
        issue("startDate", "The new terms can't start before the change")
      }
      const start = values.startDate === "" ? values.from : values.startDate
      if (values.endDate !== "" && values.endDate < start) {
        issue("endDate", "The end date can't be before the first date")
      }
    })
}

/**
 * New terms from a date: the amount, how often, the first date and the end date. The Schedule ends
 * the day before; earlier Occurrences keep the old terms. An amount is typed as its Wallet shows
 * it and keeps its direction (D15).
 */
export function ChangeFromForm({
  schedule,
  stored,
  wallet,
  defaultFrom,
  onSave,
}: {
  schedule: Schedule
  /** The Schedule's stored Occurrences. */
  stored: readonly OccurrenceRow[]
  /** The Wallet the Schedule draws on. */
  wallet: { shownAsOwed: boolean }
  defaultFrom: string
  /** May return a promise; the submit button stays disabled until it settles. */
  onSave: (change: ChangeScheduleFrom) => void | Promise<unknown>
}) {
  const transfer = schedule.toWalletId !== null
  const shownNegative = !transfer && toShown(wallet, schedule.amountCents) < 0
  const direction = transfer
    ? "Moved to the other Wallet"
    : wallet.shownAsOwed
      ? shownNegative
        ? "Pays down what's owed"
        : "Adds to what's owed"
      : shownNegative
        ? "Money out"
        : "Money in"

  const defaultValues: ChangeFromValues = {
    from: defaultFrom,
    amount: Math.abs(schedule.amountCents),
    every: String(schedule.every),
    unit: schedule.unit,
    startDate: "",
    endDate: schedule.endDate ?? "",
  }
  /** The change the values describe, with the overrides it would delete. */
  function changeOf(value: ChangeFromValues) {
    const size = Math.abs(value.amount ?? 0)
    const changes = {
      amountCents: transfer ? size : fromShown(wallet, shownNegative ? -size : size),
      unit: value.unit,
      every: Number(value.every),
      startDate: value.startDate === "" ? value.from : value.startDate,
      endDate: value.endDate === "" ? null : value.endDate,
    }
    // Until the dates and frequency make sense there is nothing to list.
    const complete =
      isDate(value.from) &&
      isDate(changes.startDate) &&
      changes.startDate >= value.from &&
      Number.isInteger(changes.every) &&
      changes.every >= 1
    const doomed = complete ? overridesOffNewTerms(stored, value.from, changes) : []
    const blocking = isDate(value.from) ? reconciledFrom(stored, value.from) : []
    return { date: value.from, changes, doomed, blocking }
  }

  const form = useForm({
    defaultValues,
    validators: { onSubmit: changeFromSchema(schedule) },
    onSubmit: async ({ value }) => {
      const { date, changes, doomed } = changeOf(value)
      await onSave({ date, changes, confirmDeleteOverrides: doomed.map((row) => row.id) })
    },
  })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="from">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="change-from">Change from</FieldLabel>
                <Input
                  id="change-from"
                  type="date"
                  className="h-11"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid || undefined}
                />
                <form.Subscribe selector={(state) => state.values.from}>
                  {(from) =>
                    /^\d{4}-\d{2}-\d{2}$/.test(from) ? (
                      <FieldDescription>
                        The current terms end the day before, on{" "}
                        {formatDisplayDate(addDays(from, -1))}.
                      </FieldDescription>
                    ) : null
                  }
                </form.Subscribe>
                {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="amount">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="change-amount">Amount</FieldLabel>
                <AmountInput
                  id="change-amount"
                  name={field.name}
                  className="h-11"
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  aria-invalid={invalid || undefined}
                />
                <FieldDescription>{direction}</FieldDescription>
                {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
              </Field>
            )
          }}
        </form.Field>

        <div className="grid grid-cols-2 gap-3">
          <form.Field name="every">
            {(field) => {
              const invalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor="change-every">Every</FieldLabel>
                  <Input
                    id="change-every"
                    className="h-11"
                    inputMode="numeric"
                    autoComplete="off"
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
          <form.Field name="unit">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="change-unit">Weeks or months</FieldLabel>
                <select
                  id="change-unit"
                  className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(event.target.value === "week" ? "week" : "month")
                  }
                >
                  <option value="month">Months</option>
                  <option value="week">Weeks</option>
                </select>
              </Field>
            )}
          </form.Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <form.Field name="startDate">
            {(field) => {
              const invalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor="change-start">First date (optional)</FieldLabel>
                  <Input
                    id="change-start"
                    type="date"
                    className="h-11"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={invalid || undefined}
                  />
                  <FieldDescription>Empty means the change date.</FieldDescription>
                  {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                </Field>
              )
            }}
          </form.Field>
          <form.Field name="endDate">
            {(field) => {
              const invalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor="change-end">End date (optional)</FieldLabel>
                  <Input
                    id="change-end"
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

        <form.Subscribe selector={(state) => state.values}>
          {(values) => (
            <OverridesToDelete
              rows={changeOf(values).doomed}
              schedule={schedule}
              wallet={wallet}
              why="The new terms don't fall on their dates."
            />
          )}
        </form.Subscribe>

        <form.Subscribe selector={(state) => state.values}>
          {(values) => <ReconciledInTheWay rows={changeOf(values).blocking} />}
        </form.Subscribe>

        <form.Subscribe
          selector={(state) =>
            [state.isSubmitting, changeOf(state.values).blocking.length > 0] as const
          }
        >
          {([isSubmitting, blocked]) => (
            <Button type="submit" className="h-11 self-start" disabled={isSubmitting || blocked}>
              Change Schedule
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

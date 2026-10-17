import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { z } from "zod"
import { AccountPicker, CategoryPicker } from "@/apps/finances/pickers"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { NewSchedule } from "@/data/finances-schedules"
import { today } from "@shared/dates"
import { cn } from "cn"

type WalletOption = { id: string; name: string }

type Kind = "transaction" | "transfer"
type Direction = "out" | "in"

type ScheduleFormValues = {
  walletId: string
  kind: Kind
  toWalletId: string
  accountId: string | null
  direction: Direction
  /** As typed; only its size counts, the direction gives the sign. */
  amount: number | null
  every: string
  unit: "week" | "month"
  startDate: string
  endDate: string
  categoryId: string | null
  note: string
}

const scheduleFormSchema = z
  .object({
    walletId: z.string().min(1, "Pick a Wallet"),
    kind: z.enum(["transaction", "transfer"]),
    toWalletId: z.string(),
    accountId: z.string().nullable(),
    direction: z.enum(["out", "in"]),
    amount: z
      .int()
      .nullable()
      .refine((cents) => cents !== null && cents !== 0, "Enter an amount like 1,500.00"),
    every: z.string().regex(/^[1-9]\d{0,2}$/, "Enter a whole number from 1 to 999"),
    unit: z.enum(["week", "month"]),
    startDate: z.iso.date("Pick a start date"),
    endDate: z.union([z.literal(""), z.iso.date("Pick an end date or leave it empty")]),
    categoryId: z.string().nullable(),
    note: z.string().max(1000, "Keep the note under 1,000 characters"),
  })
  .superRefine((values, context) => {
    if (values.kind === "transfer" && values.toWalletId === "") {
      context.addIssue({ code: "custom", path: ["toWalletId"], message: "Pick a Wallet" })
    }
    if (values.kind === "transfer" && values.toWalletId === values.walletId) {
      context.addIssue({
        code: "custom",
        path: ["toWalletId"],
        message: "Pick a different Wallet",
      })
    }
    if (values.endDate !== "" && values.endDate < values.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The end date can't be before the start date",
      })
    }
  })

/** The form's values as a Schedule: signed for a Transaction, positive for a Transfer. */
function toSchedule(values: ScheduleFormValues): NewSchedule {
  const size = Math.abs(values.amount ?? 0)
  const transfer = values.kind === "transfer"
  return {
    walletId: values.walletId,
    toWalletId: transfer ? values.toWalletId : null,
    accountId: values.accountId,
    amountCents: transfer || values.direction === "in" ? size : -size,
    unit: values.unit,
    every: Number(values.every),
    startDate: values.startDate,
    endDate: values.endDate === "" ? null : values.endDate,
    // A Transfer never counts as spending or income, so it has no Category.
    categoryId: transfer ? null : values.categoryId,
    note: values.note.trim(),
  }
}

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm dark:bg-input/30"

/** Picks one of the Wallets by id; "" while none is picked. */
function WalletSelect({
  id,
  wallets,
  value,
  invalid,
  onBlur,
  onChange,
}: {
  id: string
  wallets: readonly WalletOption[]
  value: string
  invalid: boolean
  onBlur: () => void
  onChange: (walletId: string) => void
}) {
  return (
    <select
      id={id}
      className={selectClass}
      value={value}
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={invalid || undefined}
    >
      <option value="">Pick a Wallet</option>
      {wallets.map((wallet) => (
        <option key={wallet.id} value={wallet.id}>
          {wallet.name}
        </option>
      ))}
    </select>
  )
}

/** Two or more choices shown side by side, one picked. */
function Choice<Value extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string
  name: string
  value: Value
  options: readonly { value: Value; label: string }[]
  onChange: (value: Value) => void
}) {
  return (
    <FieldSet>
      <FieldLegend variant="label">{legend}</FieldLegend>
      <div className="grid grid-cols-2 rounded-lg border p-0.5 text-sm">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex min-h-10 cursor-pointer items-center justify-center rounded-md px-2 py-1 text-center leading-tight has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              value === option.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
    </FieldSet>
  )
}

/** A new Schedule: what moves, where, how much and how often. */
export function ScheduleForm({
  wallets,
  onSave,
}: {
  /** The Wallets a Schedule may use: every one not archived. */
  wallets: readonly WalletOption[]
  /** May return a promise; the submit button stays disabled until it settles. */
  onSave: (schedule: NewSchedule) => void | Promise<unknown>
}) {
  const [defaultValues] = useState<ScheduleFormValues>(() => ({
    walletId: wallets.length === 1 ? (wallets[0]?.id ?? "") : "",
    kind: "transaction",
    toWalletId: "",
    accountId: null,
    direction: "out",
    amount: null,
    every: "1",
    unit: "month",
    startDate: today(),
    endDate: "",
    categoryId: null,
    note: "",
  }))

  const form = useForm({
    defaultValues,
    validators: { onSubmit: scheduleFormSchema },
    onSubmit: async ({ value }) => {
      await onSave(toSchedule(value))
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
        <form.Field name="walletId">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="schedule-wallet">Wallet</FieldLabel>
                <WalletSelect
                  id="schedule-wallet"
                  wallets={wallets}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  invalid={invalid}
                />
                {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="kind">
          {(field) => (
            <Choice
              legend="Makes"
              name="schedule-kind"
              value={field.state.value}
              onChange={field.handleChange}
              options={[
                { value: "transaction", label: "A Transaction" },
                { value: "transfer", label: "A Transfer to a Wallet" },
              ]}
            />
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) =>
            kind === "transfer" ? (
              <form.Field name="toWalletId">
                {(field) => {
                  const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={invalid || undefined}>
                      <FieldLabel htmlFor="schedule-to-wallet">Transfer to</FieldLabel>
                      <WalletSelect
                        id="schedule-to-wallet"
                        wallets={wallets}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={field.handleChange}
                        invalid={invalid}
                      />
                      {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                    </Field>
                  )
                }}
              </form.Field>
            ) : (
              <form.Field name="direction">
                {(field) => (
                  <Choice
                    legend="Direction"
                    name="schedule-direction"
                    value={field.state.value}
                    onChange={field.handleChange}
                    options={[
                      { value: "out", label: "Money out" },
                      { value: "in", label: "Money in" },
                    ]}
                  />
                )}
              </form.Field>
            )
          }
        </form.Subscribe>

        <form.Field name="amount">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="schedule-amount">Amount</FieldLabel>
                <AmountInput
                  id="schedule-amount"
                  name={field.name}
                  className="h-11"
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  aria-invalid={invalid || undefined}
                />
                {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="accountId">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="schedule-account">Account</FieldLabel>
              <AccountPicker
                id="schedule-account"
                value={field.state.value}
                onValueChange={field.handleChange}
              />
              <FieldDescription>
                Who is paid or pays, such as a landlord. Optional.
              </FieldDescription>
            </Field>
          )}
        </form.Field>

        <div className="grid grid-cols-2 gap-3">
          <form.Field name="every">
            {(field) => {
              const invalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor="schedule-every">Every</FieldLabel>
                  <Input
                    id="schedule-every"
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
                <FieldLabel htmlFor="schedule-unit">Weeks or months</FieldLabel>
                <select
                  id="schedule-unit"
                  className={selectClass}
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
                  <FieldLabel htmlFor="schedule-start">Start date</FieldLabel>
                  <Input
                    id="schedule-start"
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
          <form.Field name="endDate">
            {(field) => {
              const invalid = field.state.meta.isTouched && !field.state.meta.isValid
              return (
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor="schedule-end">End date (optional)</FieldLabel>
                  <Input
                    id="schedule-end"
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

        <form.Subscribe selector={(state) => state.values.kind}>
          {(kind) =>
            kind === "transaction" ? (
              <form.Field name="categoryId">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor="schedule-category">Category</FieldLabel>
                    <CategoryPicker
                      id="schedule-category"
                      value={field.state.value}
                      onValueChange={field.handleChange}
                    />
                  </Field>
                )}
              </form.Field>
            ) : (
              <p className="text-sm text-muted-foreground">
                A Transfer has no Category: it is neither spending nor income.
              </p>
            )
          }
        </form.Subscribe>

        <form.Field name="note">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="schedule-note">Note</FieldLabel>
                <Textarea
                  id="schedule-note"
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

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="h-11 self-start" disabled={isSubmitting}>
              Add Schedule
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

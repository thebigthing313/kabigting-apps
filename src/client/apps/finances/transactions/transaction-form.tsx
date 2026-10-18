import { useForm } from "@tanstack/react-form"
import { type ComponentType, useState } from "react"
import { z } from "zod"
import {
  Choice,
  directionOptions,
  type ShownSign,
  WalletSelect,
  type WalletOption,
} from "@/apps/finances/form-controls"
import { AccountPicker, CategoryPicker } from "@/apps/finances/pickers"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { NewTransaction } from "@/data/finances-transactions"
import { today } from "@shared/dates"
import { type PlannedItem, plannedKey, suggestMatches } from "@shared/finances/reconcile"
import { transactionStatus } from "@shared/finances/schemas"
import { fromShown, toShown } from "@shared/finances/wallets"

type Status = NewTransaction["status"]

type TransactionFormValues = {
  status: Status
  walletId: string
  date: string
  shownSign: ShownSign
  /** As typed; only its size counts, `shownSign` gives the sign. */
  amount: number | null
  accountId: string | null
  categoryId: string | null
  note: string
  /** The suggested Planned match ticked to Reconcile on save. */
  match: PlannedItem | null
}

const formSchema = z.object({
  status: transactionStatus,
  walletId: z.string().min(1, "Pick a Wallet"),
  date: z.iso.date("Pick a date"),
  shownSign: z.enum(["minus", "plus"]),
  amount: z
    .int()
    .nullable()
    .refine((cents) => cents !== null && cents !== 0, "Enter an amount like 42.50"),
  accountId: z.string().nullable(),
  categoryId: z.string().nullable(),
  note: z.string().max(1000, "Keep the note under 1,000 characters"),
  match: z.custom<PlannedItem>().nullable(),
})

/** The form's values as a Transaction. The Amount is typed as its Wallet shows it (D15). */
function toTransaction(
  values: TransactionFormValues,
  wallet: { shownAsOwed: boolean },
): NewTransaction {
  const size = Math.abs(values.amount ?? 0)
  return {
    status: values.status,
    walletId: values.walletId,
    date: values.date,
    amountCents: fromShown(wallet, values.shownSign === "plus" ? size : -size),
    accountId: values.accountId,
    categoryId: values.categoryId,
    note: values.note.trim(),
  }
}

/** What the suggested matches are worked out from, and the tick. */
export type MatchesProps = {
  walletId: string
  date: string
  amountCents: number
  /** The ticked match's key, if any. */
  selected: string | null
  onSelect: (item: PlannedItem | null) => void
}

/** The ticked match, if it still suits the Actual as saved; a changed Wallet or sign drops it. */
function stillMatching(entry: NewTransaction, match: PlannedItem | null): PlannedItem | null {
  if (match === null || entry.status !== "actual") return null
  return suggestMatches(entry, [match]).length === 1 ? match : null
}

const SUBMIT_LABELS: Record<Status, string> = { actual: "Add Actual", planned: "Add Planned" }

/**
 * A one-off Planned or an Actual: Wallet, date, Amount with its direction, Account, Category and
 * note. Given `initial`, it edits that row and Planned or Actual stays as it is.
 */
export function TransactionForm({
  wallets,
  status = "actual",
  walletId,
  initial,
  locked = false,
  matches: Matches,
  onSave,
}: {
  /** The Wallets it may be on. */
  wallets: readonly WalletOption[]
  /** Planned or Actual to start with, when adding. */
  status?: Status
  /** The Wallet to start on, when adding. */
  walletId?: string
  /** The row being edited. */
  initial?: NewTransaction
  /** An imported Actual: its amount, date and Wallet came from the bank and can't change. */
  locked?: boolean
  /** The suggested Planned matches for a new Actual, from what has been typed so far. */
  matches?: ComponentType<MatchesProps>
  /**
   * May return a promise; the submit button stays disabled until it settles. `match` is the
   * suggested Planned item ticked to Reconcile the new Actual to, if any.
   */
  onSave: (entry: NewTransaction, match: PlannedItem | null) => void | Promise<unknown>
}) {
  const isOwed = (id: string) => wallets.find((wallet) => wallet.id === id)?.shownAsOwed ?? false
  const [defaultValues] = useState<TransactionFormValues>(() => {
    if (initial) {
      const shown = toShown({ shownAsOwed: isOwed(initial.walletId) }, initial.amountCents)
      return {
        ...initial,
        shownSign: shown > 0 ? "plus" : "minus",
        amount: Math.abs(initial.amountCents),
        match: null,
      }
    }
    const startOn = walletId ?? (wallets.length === 1 ? (wallets[0]?.id ?? "") : "")
    // Money out by default: shown as a plus on a Wallet shown as owed.
    return {
      status,
      walletId: startOn,
      date: today(),
      shownSign: isOwed(startOn) ? "plus" : "minus",
      amount: null,
      accountId: null,
      categoryId: null,
      note: "",
      match: null,
    }
  })

  const form = useForm({
    defaultValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      const entry = toTransaction(value, { shownAsOwed: isOwed(value.walletId) })
      await onSave(entry, stillMatching(entry, value.match))
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
        {initial ? null : (
          <form.Field name="status">
            {(field) => (
              <Choice
                legend="Planned or Actual"
                name="transaction-status"
                value={field.state.value}
                onChange={field.handleChange}
                options={[
                  { value: "actual", label: "Actual" },
                  { value: "planned", label: "Planned" },
                ]}
              />
            )}
          </form.Field>
        )}

        <form.Field name="walletId">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="transaction-wallet">Wallet</FieldLabel>
                <WalletSelect
                  id="transaction-wallet"
                  wallets={wallets}
                  value={field.state.value}
                  disabled={locked}
                  onBlur={field.handleBlur}
                  onChange={(next) => {
                    // The sign is typed as the Wallet shows it; keep what was meant across Wallets.
                    if (isOwed(next) !== isOwed(field.state.value)) {
                      form.setFieldValue("shownSign", (sign) =>
                        sign === "plus" ? "minus" : "plus",
                      )
                    }
                    field.handleChange(next)
                  }}
                  invalid={invalid}
                />
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
                <FieldLabel htmlFor="transaction-date">Date</FieldLabel>
                <Input
                  id="transaction-date"
                  type="date"
                  className="h-11"
                  value={field.state.value}
                  disabled={locked}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid || undefined}
                />
                {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Subscribe selector={(state) => isOwed(state.values.walletId)}>
          {(owed) => (
            <form.Field name="shownSign">
              {(field) => (
                <Choice
                  legend="Direction"
                  name="transaction-direction"
                  value={field.state.value}
                  disabled={locked}
                  onChange={field.handleChange}
                  options={directionOptions(owed)}
                />
              )}
            </form.Field>
          )}
        </form.Subscribe>

        <form.Field name="amount">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="transaction-amount">Amount</FieldLabel>
                <AmountInput
                  id="transaction-amount"
                  name={field.name}
                  className="h-11"
                  value={field.state.value}
                  disabled={locked}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  aria-invalid={invalid || undefined}
                />
                {locked ? (
                  <FieldDescription>
                    The amount, date and Wallet came from the bank and can&apos;t be changed.
                  </FieldDescription>
                ) : null}
                {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="accountId">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="transaction-account">Account</FieldLabel>
              <AccountPicker
                id="transaction-account"
                value={field.state.value}
                onValueChange={field.handleChange}
              />
              <FieldDescription>Who was paid or paid you. Optional.</FieldDescription>
            </Field>
          )}
        </form.Field>

        <form.Field name="categoryId">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="transaction-category">Category</FieldLabel>
              <CategoryPicker
                id="transaction-category"
                value={field.state.value}
                onValueChange={field.handleChange}
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="note">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="transaction-note">Note</FieldLabel>
                <Textarea
                  id="transaction-note"
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

        {Matches && !initial ? (
          <form.Subscribe selector={(state) => state.values}>
            {(values) => {
              const entry = toTransaction(values, { shownAsOwed: isOwed(values.walletId) })
              const ready =
                values.status === "actual" &&
                values.walletId !== "" &&
                z.iso.date().safeParse(values.date).success &&
                entry.amountCents !== 0
              return ready ? (
                <Matches
                  walletId={entry.walletId}
                  date={entry.date}
                  amountCents={entry.amountCents}
                  selected={values.match ? plannedKey(values.match) : null}
                  onSelect={(item) => form.setFieldValue("match", item)}
                />
              ) : null
            }}
          </form.Subscribe>
        ) : null}

        <form.Subscribe selector={(state) => [state.isSubmitting, state.values.status] as const}>
          {([isSubmitting, current]) => (
            <Button type="submit" className="h-11 self-start" disabled={isSubmitting}>
              {initial ? "Save changes" : SUBMIT_LABELS[current]}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

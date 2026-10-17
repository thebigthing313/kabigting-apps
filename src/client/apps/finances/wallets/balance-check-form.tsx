import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { z } from "zod"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { Wallet } from "@/data/finances-wallets"
import { today } from "@shared/dates"
import { fromShown } from "@shared/finances/wallets"

export type BalanceCheckEntry = { walletId: string; date: string; amountCents: number }

const formSchema = z.object({
  walletId: z.string().min(1, "Pick a Wallet"),
  date: z.iso.date("Pick a date"),
  amountShown: z
    .int()
    .nullable()
    .refine((cents) => cents !== null, "Enter the balance like 1,250.00"),
})

type FormValues = { walletId: string; date: string; amountShown: number | null }

/** A Balance check: the Wallet, the date and the balance exactly as the bank shows it. */
export function BalanceCheckForm({
  wallets,
  walletId,
  onSave,
}: {
  /** The Wallets a check can be entered for. */
  wallets: readonly Wallet[]
  /** The Wallet to start on. */
  walletId?: string
  onSave: (entry: BalanceCheckEntry) => void | Promise<unknown>
}) {
  const [defaultValues] = useState<FormValues>(() => ({
    walletId: walletId ?? "",
    date: today(),
    amountShown: null,
  }))

  const form = useForm({
    defaultValues,
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      const wallet = wallets.find((candidate) => candidate.id === value.walletId)
      if (!wallet || value.amountShown === null) return
      await onSave({
        walletId: wallet.id,
        date: value.date,
        // A card's bank shows what is owed; it is stored as a negative balance.
        amountCents: fromShown(wallet, value.amountShown),
      })
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
                <FieldLabel htmlFor="balance-check-wallet">Wallet</FieldLabel>
                <select
                  id="balance-check-wallet"
                  name={field.name}
                  className="h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={invalid || undefined}
                >
                  <option value="" disabled>
                    Pick a Wallet
                  </option>
                  {wallets.map((wallet) => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.name}
                    </option>
                  ))}
                </select>
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
                <FieldLabel htmlFor="balance-check-date">Date</FieldLabel>
                <Input
                  id="balance-check-date"
                  name={field.name}
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

        <form.Subscribe
          selector={(state) =>
            wallets.find((wallet) => wallet.id === state.values.walletId)?.shownAsOwed ?? false
          }
        >
          {(shownAsOwed) => (
            <form.Field name="amountShown">
              {(field) => {
                const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel htmlFor="balance-check-amount">Balance</FieldLabel>
                    <AmountInput
                      id="balance-check-amount"
                      name={field.name}
                      className="h-11"
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid || undefined}
                    />
                    <FieldDescription>
                      {shownAsOwed
                        ? "The amount owed, as the bank shows it."
                        : "The balance as the bank shows it at the end of that day."}
                    </FieldDescription>
                    {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
                  </Field>
                )
              }}
            </form.Field>
          )}
        </form.Subscribe>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="h-11 self-start" disabled={isSubmitting}>
              Save Balance check
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

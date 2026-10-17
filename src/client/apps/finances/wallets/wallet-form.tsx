import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { z } from "zod"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { WalletSettings } from "@/data/finances-wallets"
import { fromShown, toShown } from "@shared/finances/wallets"

const walletFormSchema = z.object({
  name: z.string().trim().min(1, "Give the Wallet a name").max(100, "Keep it under 100 characters"),
  inForecast: z.boolean(),
  // Typed as the Wallet shows it: an amount owed when the Wallet is shown as owed.
  thresholdShown: z
    .int()
    .nullable()
    .refine((cents) => cents !== null, "Enter an amount like 250.00"),
  shownAsOwed: z.boolean(),
})

type WalletFormValues = {
  name: string
  inForecast: boolean
  thresholdShown: number | null
  shownAsOwed: boolean
}

const NEW_WALLET: WalletSettings = {
  name: "",
  inForecast: false,
  lowBalanceThresholdCents: 0,
  shownAsOwed: false,
}

/** A Wallet's name, forecast and display settings, for a new Wallet or its Settings tab. */
export function WalletForm({
  initial = NEW_WALLET,
  submitLabel,
  onSave,
}: {
  initial?: WalletSettings
  submitLabel: string
  /** May return a promise; the submit button stays disabled until it settles. */
  onSave: (settings: WalletSettings) => void | Promise<unknown>
}) {
  const [defaultValues] = useState<WalletFormValues>(() => ({
    name: initial.name,
    inForecast: initial.inForecast,
    thresholdShown: toShown(initial, initial.lowBalanceThresholdCents),
    shownAsOwed: initial.shownAsOwed,
  }))

  const form = useForm({
    defaultValues,
    validators: { onSubmit: walletFormSchema },
    onSubmit: async ({ value }) => {
      if (value.thresholdShown === null) return
      await onSave({
        name: value.name.trim(),
        inForecast: value.inForecast,
        lowBalanceThresholdCents: fromShown(value, value.thresholdShown),
        shownAsOwed: value.shownAsOwed,
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
        <form.Field name="name">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="wallet-name">Name</FieldLabel>
                <Input
                  id="wallet-name"
                  name={field.name}
                  className="h-11"
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

        <form.Field name="inForecast">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                id="wallet-in-forecast"
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
              <FieldContent>
                <FieldLabel htmlFor="wallet-in-forecast">In the forecast</FieldLabel>
                <FieldDescription>Gets its own Forecast on Finances home.</FieldDescription>
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Field name="shownAsOwed">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                id="wallet-shown-as-owed"
                checked={field.state.value}
                onCheckedChange={(checked) => {
                  field.handleChange(checked)
                  // Only the display flips: the threshold typed so far keeps its stored value.
                  form.setFieldValue("thresholdShown", (typed) =>
                    typed === null
                      ? null
                      : toShown(
                          { shownAsOwed: checked },
                          fromShown({ shownAsOwed: !checked }, typed),
                        ),
                  )
                }}
              />
              <FieldContent>
                <FieldLabel htmlFor="wallet-shown-as-owed">Shown as owed</FieldLabel>
                <FieldDescription>
                  For a card: amounts are typed and shown as what you owe. Only the display flips.
                </FieldDescription>
              </FieldContent>
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.shownAsOwed}>
          {(shownAsOwed) => (
            <form.Field name="thresholdShown">
              {(field) => {
                const invalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={invalid || undefined}>
                    <FieldLabel htmlFor="wallet-threshold">Low-balance threshold</FieldLabel>
                    <AmountInput
                      // Remounts on a flip, so the text shows the flipped amount.
                      key={String(shownAsOwed)}
                      id="wallet-threshold"
                      name={field.name}
                      className="h-11"
                      value={field.state.value}
                      onValueChange={field.handleChange}
                      onBlur={field.handleBlur}
                      aria-invalid={invalid || undefined}
                    />
                    <FieldDescription>
                      {shownAsOwed
                        ? "Warn when the amount owed goes above this."
                        : "Warn when the balance goes below this."}
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
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

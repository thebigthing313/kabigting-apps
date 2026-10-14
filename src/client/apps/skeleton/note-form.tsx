import { useForm } from "@tanstack/react-form"
import { CalendarIcon } from "lucide-react"
import { useState } from "react"
import { z } from "zod"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { NoteInput } from "@/data/skeleton-notes"
import { formatDisplayDate, fromPickerDate, toPickerDate, today } from "@shared/dates"
import { isoDate } from "@shared/schemas/primitives"

const noteFormSchema = z.object({
  text: z.string().trim().min(1, "Write a note").max(500, "Keep it under 500 characters"),
  amountCents: z
    .int()
    .nullable()
    .refine((cents) => cents !== null, "Enter an amount like 1,250.50 (minus for money out)"),
  onDate: isoDate,
})

type NoteFormValues = { text: string; amountCents: number | null; onDate: string }

/** Create or edit a note. Validation runs on submit with the shared Zod 4 schema. */
export function NoteForm({
  initial,
  submitLabel,
  onSave,
}: {
  initial?: NoteInput
  submitLabel: string
  onSave: (note: NoteInput) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const defaultValues: NoteFormValues = initial ?? { text: "", amountCents: null, onDate: today() }

  const form = useForm({
    defaultValues,
    validators: { onSubmit: noteFormSchema },
    onSubmit: ({ value }) => {
      if (value.amountCents === null) return
      onSave({ text: value.text.trim(), amountCents: value.amountCents, onDate: value.onDate })
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
        <form.Field name="text">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Note</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
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

        <form.Field name="amountCents">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Amount</FieldLabel>
                <AmountInput
                  id={field.name}
                  name={field.name}
                  className="h-11"
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  onBlur={field.handleBlur}
                  aria-invalid={invalid || undefined}
                />
                <FieldDescription>Money out is negative, e.g. -45.20.</FieldDescription>
                {invalid ? <FieldError errors={field.state.meta.errors} /> : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="onDate">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Date</FieldLabel>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      id={field.name}
                      type="button"
                      variant="outline"
                      className="h-11 justify-start font-normal"
                    />
                  }
                >
                  <CalendarIcon />
                  {formatDisplayDate(field.state.value)}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toPickerDate(field.state.value)}
                    defaultMonth={toPickerDate(field.state.value)}
                    onSelect={(picked) => {
                      if (picked) field.handleChange(fromPickerDate(picked))
                      setPickerOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
          )}
        </form.Field>

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="h-11" disabled={isSubmitting}>
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  )
}

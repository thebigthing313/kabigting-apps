import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { type AdminAccount, useCreateAccount } from "@/data/admin-accounts"
import { AppCheckboxes } from "@/shell/accounts/app-checkboxes"
import { IssuedPassword } from "@/shell/accounts/issued-password"
import type { AppKey } from "@shared/apps"
import { createAccountInput } from "@shared/schemas/admin"

type NewAccountValues = { email: string; name: string; apps: AppKey[] }

const EMPTY: NewAccountValues = { email: "", name: "", apps: [] }

function NewAccountForm({ onCreated }: { onCreated: (account: AdminAccount) => void }) {
  const create = useCreateAccount()
  const form = useForm({
    defaultValues: EMPTY,
    validators: { onSubmit: createAccountInput },
    onSubmit: async ({ value }) => {
      try {
        onCreated(await create.mutateAsync(value))
      } catch {
        // The error is already reported; the form stays as typed so it can be fixed.
      }
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
        <form.Field name="email">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="off"
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

        <form.Field name="name">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  autoComplete="off"
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

        <form.Field name="apps">
          {(field) => <AppCheckboxes value={field.state.value} onChange={field.handleChange} />}
        </form.Field>

        <DialogFooter>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <Button type="submit" className="h-11" disabled={submitting}>
                {submitting ? "Creating…" : "Create Account"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </FieldGroup>
    </form>
  )
}

/** Create an Account, then show its temporary password. */
export function NewAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [created, setCreated] = useState<AdminAccount | null>(null)

  function close() {
    setCreated(null)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{created ? "Account created" : "New Account"}</DialogTitle>
          <DialogDescription>
            {created
              ? "The Account signs in with this temporary password."
              : "They get a temporary password to change at first sign-in."}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <IssuedPassword account={created} onDone={close} />
        ) : (
          <NewAccountForm onCreated={setCreated} />
        )}
      </DialogContent>
    </Dialog>
  )
}

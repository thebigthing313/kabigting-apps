import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { formText } from "@/shell/form-field"

export type NameDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialName?: string
  /** Names already in use, compared without case; the entry's own name is allowed. */
  takenNames: readonly string[]
  onSave: (name: string) => void
}

/** A small dialog asking for one unique name, used to add or rename an Account or Category. */
export function NameDialog({ open, onOpenChange, title, ...form }: NameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts from the current name. */}
        {open ? <NameForm {...form} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function NameForm({
  initialName = "",
  takenNames,
  onSave,
}: Omit<NameDialogProps, "open" | "onOpenChange" | "title">) {
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        const name = formText(new FormData(event.currentTarget), "name").trim()
        const lowered = name.toLocaleLowerCase()
        if (name === "") {
          setError("Enter a name")
        } else if (
          lowered !== initialName.toLocaleLowerCase() &&
          takenNames.some((taken) => taken.toLocaleLowerCase() === lowered)
        ) {
          setError(`"${name}" is already used`)
        } else {
          onSave(name)
        }
      }}
    >
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="name-dialog-name">Name</FieldLabel>
        <Input
          id="name-dialog-name"
          name="name"
          autoComplete="off"
          className="h-11"
          defaultValue={initialName}
          maxLength={100}
          aria-invalid={error ? true : undefined}
          onChange={() => setError(null)}
        />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
      <DialogFooter className="mt-4">
        <Button type="submit" className="h-11">
          Save
        </Button>
      </DialogFooter>
    </form>
  )
}

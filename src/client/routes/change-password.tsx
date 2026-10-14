import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient, fetchSession, signOut } from "@/data/session"
import { AuthCard } from "@/shell/auth-card"
import { formText } from "@/shell/form-field"

const MIN_LENGTH = 12

export const Route = createFileRoute("/change-password")({
  beforeLoad: async ({ location }) => {
    const session = await fetchSession()
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } })
    return { forced: session.user.mustChangePassword }
  },
  component: ChangePasswordPage,
})

function problemWith(current: string, next: string, confirm: string): string | null {
  if (next.length < MIN_LENGTH) return `Use at least ${MIN_LENGTH} characters.`
  if (next === current) return "Choose a password different from the current one."
  if (next !== confirm) return "The two new passwords do not match."
  return null
}

function ChangePasswordPage() {
  const navigate = useNavigate()
  const { forced } = Route.useRouteContext()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(form: FormData) {
    const current = formText(form, "current")
    const next = formText(form, "next")
    const problem = problemWith(current, next, formText(form, "confirm"))
    if (problem) {
      setError(problem)
      return
    }
    setPending(true)
    setError(null)
    const { error: changeError } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    })
    setPending(false)
    if (changeError) {
      setError(changeError.message ?? "The password could not be changed.")
      return
    }
    await navigate({ to: "/" })
  }

  return (
    <AuthCard
      title={forced ? "Choose your password" : "Change password"}
      description={
        forced
          ? "You signed in with a temporary password. Choose your own to continue."
          : "Your other devices will be signed out."
      }
    >
      <form action={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="current">
              {forced ? "Temporary password" : "Current password"}
            </FieldLabel>
            <Input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
              className="h-11"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="next">New password</FieldLabel>
            <Input
              id="next"
              name="next"
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_LENGTH}
              className="h-11"
            />
            <FieldDescription>At least {MIN_LENGTH} characters.</FieldDescription>
          </Field>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="confirm">Confirm new password</FieldLabel>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              className="h-11"
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? "Saving…" : "Save password"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}

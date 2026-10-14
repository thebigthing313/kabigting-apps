import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { authClient, fetchSession } from "@/data/session"
import { AuthCard } from "@/shell/auth-card"
import { formText } from "@/shell/form-field"
import { safeRedirect } from "@/shell/redirect"

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ search }) => {
    const session = await fetchSession()
    if (session?.user.mustChangePassword) throw redirect({ to: "/change-password" })
    if (session) throw redirect({ href: safeRedirect(search.redirect) })
  },
  component: SignInPage,
})

function SignInPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(form: FormData) {
    setPending(true)
    setError(null)
    const { data, error: signInError } = await authClient.signIn.email({
      email: formText(form, "email"),
      password: formText(form, "password"),
    })
    setPending(false)
    if (signInError || !data) {
      setError("That email and password do not match an Account.")
      return
    }
    if (data.user.mustChangePassword) await navigate({ to: "/change-password" })
    else await navigate({ href: safeRedirect(search.redirect) })
  }

  return (
    <AuthCard
      title="Sign in"
      description="Kabigting Apps is invite-only. Ask the Admin for an Account."
    >
      {/* onSubmit, not a form action: React resets a form after an action, which would clear
          what was typed when the attempt fails. */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit(new FormData(event.currentTarget))
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="h-11"
            />
          </Field>
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11"
              aria-invalid={error ? true : undefined}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Field>
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  )
}

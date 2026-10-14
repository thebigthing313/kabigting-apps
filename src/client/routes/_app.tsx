import { createFileRoute, redirect } from "@tanstack/react-router"
import { api } from "@/data/api"
import { fetchSession } from "@/data/session"
import { AppShell } from "@/shell/app-shell"

/** Every signed-in page: needs a session and a changed password, and knows the Account's Apps. */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    const session = await fetchSession()
    if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } })
    if (session.user.mustChangePassword) throw redirect({ to: "/change-password" })
    const response = await api.access.$get()
    if (!response.ok) throw new Error("Could not load your Apps")
    const { apps } = await response.json()
    return { session, apps }
  },
  component: AppShell,
})

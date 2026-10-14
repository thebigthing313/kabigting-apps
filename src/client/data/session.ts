import { createAuthClient } from "better-auth/react"
import { inferAdditionalFields } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [inferAdditionalFields({ user: { mustChangePassword: { type: "boolean" } } })],
})

export type Session = typeof authClient.$Infer.Session

/** The current session, or null when signed out. Always asks the server (no cookie cache). */
export async function fetchSession(): Promise<Session | null> {
  const { data } = await authClient.getSession()
  return data ?? null
}

/** Signs out and reloads the app from scratch so no signed-in state survives in memory. */
export async function signOut(): Promise<void> {
  await authClient.signOut()
  window.location.assign("/sign-in")
}

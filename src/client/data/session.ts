import { createAuthClient } from "better-auth/react"
import { inferAdditionalFields } from "better-auth/client/plugins"
import { cleanupCollections } from "@/data/collection-factory"
import { queryClient } from "@/data/query-client"

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

/**
 * Signs out, drops every cached row and collection, and reloads the app from scratch so no
 * signed-in state survives in memory. `leavePage` first moves off any page reading a collection
 * (e.g. a router navigation to sign-in), so nothing reads a collection being cleaned up.
 */
export async function signOut(leavePage?: () => Promise<unknown>): Promise<void> {
  try {
    await authClient.signOut()
    await leavePage?.()
  } finally {
    queryClient.clear()
    await cleanupCollections()
    window.location.assign("/sign-in")
  }
}

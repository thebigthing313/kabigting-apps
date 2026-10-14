import { createAuthClient } from "better-auth/react"
import { inferAdditionalFields } from "better-auth/client/plugins"
import { cleanupCollections } from "@/data/collection-factory"
import { ApiRequestError } from "@/data/error-handler"
import { queryClient } from "@/data/query-client"

export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [inferAdditionalFields({ user: { mustChangePassword: { type: "boolean" } } })],
})

export type Session = typeof authClient.$Infer.Session

/**
 * The current session, or null when signed out. Always asks the server (no cookie cache). A
 * failed request throws, so being offline never looks like being signed out.
 */
export async function fetchSession(): Promise<Session | null> {
  let result: Awaited<ReturnType<typeof authClient.getSession>>
  try {
    result = await authClient.getSession()
  } catch {
    throw new ApiRequestError(0, "network", "You appear to be offline")
  }
  if (result.error) {
    const status = result.error.status
    const code = status === 0 ? "network" : "internal"
    throw new ApiRequestError(status, code, "Could not check your session")
  }
  return result.data ?? null
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

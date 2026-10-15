/** Wire shapes for the Admin's Accounts screen. */
import { z } from "zod"
import { isAppKey, type AppKey } from "../apps.ts"

/** Removed wins over awaiting a password change: a Removed Account cannot sign in at all. */
export type AccountStatus = "active" | "awaiting_password_change" | "removed"

export type AdminAccount = {
  id: string
  email: string
  name: string
  role: "admin" | "user"
  status: AccountStatus
  apps: AppKey[]
  /** Readable until the Account replaces it; null once it has. */
  temporaryPassword: string | null
}

export const appKey = z.custom<AppKey>((value) => typeof value === "string" && isAppKey(value), {
  message: "Unknown App",
})

export const accountName = z.string().trim().min(1, "Enter a name").max(100)

export const accountEmail = z.string().trim().toLowerCase().pipe(z.email("Enter an email address"))

export const createAccountInput = z.strictObject({
  email: accountEmail,
  name: accountName,
  apps: z.array(appKey),
})

export type CreateAccountInput = z.input<typeof createAccountInput>

/** Better Auth ids are opaque strings, not UUIDs. */
export const accountParams = z.strictObject({ id: z.string().min(1).max(100) })

/** The full set of Apps the Account may open after saving. */
export const setAppsInput = z.strictObject({ apps: z.array(appKey) })

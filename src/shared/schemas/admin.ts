/** Wire shapes for the Admin's Accounts screen. */
import type { AppKey } from "../apps.ts"

/** Removed wins over awaiting a password change: a Removed Account cannot sign in at all. */
export type AccountStatus = "active" | "awaiting_password_change" | "removed"

export type AdminAccount = {
  id: string
  email: string
  name: string
  role: "admin" | "user"
  status: AccountStatus
  apps: AppKey[]
}

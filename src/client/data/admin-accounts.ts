// The Admin's Accounts: plain TanStack Query, not a collection. Every action is a server command
// with a server-made result (a temporary password, a ban), so nothing is applied optimistically.
import { useQuery } from "@tanstack/react-query"
import { api } from "@/data/api"
import { readJson } from "@/data/error-handler"
import type { AdminAccount } from "@shared/schemas/admin"

export type { AdminAccount }

export const ACCOUNTS_KEY = ["admin", "accounts"] as const

export function useAdminAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () => (await readJson(await api.admin.accounts.$get())).rows,
  })
}

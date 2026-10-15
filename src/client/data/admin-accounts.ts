// The Admin's Accounts: plain TanStack Query, not a collection. Every action is a server command
// with a server-made result (a temporary password, a ban), so nothing is applied optimistically.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/data/api"
import { readJson, reportError } from "@/data/error-handler"
import type { AdminAccount, CreateAccountInput } from "@shared/schemas/admin"

export type { AdminAccount, CreateAccountInput }

export const ACCOUNTS_KEY = ["admin", "accounts"] as const

export function useAdminAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: async () => (await readJson(await api.admin.accounts.$get())).rows,
  })
}

/** A server command on the Accounts list: refreshes the list after it succeeds. */
function useAccountCommand<Input>(
  action: string,
  run: (input: Input) => Promise<{ row: AdminAccount }>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: Input) => (await run(input)).row,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
    onError: (error) => reportError(error, action),
  })
}

export function useCreateAccount() {
  return useAccountCommand("Creating the Account", async (json: CreateAccountInput) =>
    readJson(await api.admin.accounts.$post({ json })),
  )
}

import { getRouteApi } from "@tanstack/react-router"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdminAccounts } from "@/data/admin-accounts"
import { AccountsTable } from "@/shell/accounts/accounts-table"

const accountsRoute = getRouteApi("/_app/admin/accounts")

/** The Admin's screen for every Account and its App access. */
export function AccountsPage() {
  const { session } = accountsRoute.useRouteContext()
  const { data: accounts, isPending, isError } = useAdminAccounts()

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Accounts</h1>
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : isError ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          The Accounts could not be loaded. Try again shortly.
        </p>
      ) : (
        <AccountsTable accounts={accounts} selfId={session.user.id} />
      )}
    </div>
  )
}

import { getRouteApi } from "@tanstack/react-router"
import { UserPlusIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAdminAccounts } from "@/data/admin-accounts"
import { AccountActionDialog, type ActionTarget } from "@/shell/accounts/account-actions"
import { AccountsTable } from "@/shell/accounts/accounts-table"
import { NewAccountDialog } from "@/shell/accounts/new-account-dialog"

const accountsRoute = getRouteApi("/_app/admin/accounts")

/** The Admin's screen for every Account and its App access. */
export function AccountsPage() {
  const { session } = accountsRoute.useRouteContext()
  const { data: accounts, isPending, isError } = useAdminAccounts()
  const [creating, setCreating] = useState(false)
  const [target, setTarget] = useState<ActionTarget | null>(null)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Accounts</h1>
        <Button className="h-11" onClick={() => setCreating(true)}>
          <UserPlusIcon />
          New Account
        </Button>
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
        <AccountsTable accounts={accounts} selfId={session.user.id} onAction={setTarget} />
      )}

      <NewAccountDialog open={creating} onClose={() => setCreating(false)} />
      <AccountActionDialog target={target} onClose={() => setTarget(null)} />
    </div>
  )
}

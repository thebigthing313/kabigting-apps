import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AdminAccount } from "@/data/admin-accounts"
import { cn } from "@/lib/utils"
import { AccountActionsMenu, type ActionTarget } from "@/shell/accounts/account-actions"
import { TemporaryPassword } from "@/shell/accounts/temporary-password"
import { appTitle } from "@shared/apps"
import type { AccountStatus } from "@shared/schemas/admin"

const STATUS_LABEL: Record<AccountStatus, string> = {
  active: "Active",
  awaiting_password_change: "Awaiting password change",
  removed: "Removed",
}

function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  )
}

function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <Pill
      className={cn(
        status === "active" && "border-transparent bg-primary/10 text-primary",
        status === "awaiting_password_change" &&
          "border-transparent bg-amber-500/15 text-amber-800 dark:text-amber-300",
        status === "removed" && "text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status]}
    </Pill>
  )
}

function AppChips({ apps }: { apps: AdminAccount["apps"] }) {
  if (apps.length === 0) return <span className="text-sm text-muted-foreground">No Apps</span>
  return (
    <span className="flex flex-wrap gap-1">
      {apps.map((app) => (
        <Pill key={app}>{appTitle(app)}</Pill>
      ))}
    </span>
  )
}

function Identity({ account, isSelf }: { account: AdminAccount; isSelf: boolean }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 truncate font-medium">
        {account.name}
        {isSelf && <Pill>You</Pill>}
      </p>
      <p className="truncate text-sm text-muted-foreground">{account.email}</p>
    </div>
  )
}

/** Shown while the Account still signs in with the password the Admin issued. */
function PendingPassword({ account }: { account: AdminAccount }) {
  if (account.status !== "awaiting_password_change") return null
  if (!account.temporaryPassword) {
    return <p className="text-sm text-muted-foreground">Reset to issue a new password</p>
  }
  return (
    <TemporaryPassword
      password={account.temporaryPassword}
      label={`Temporary password for ${account.email}`}
    />
  )
}

const features = tableFeatures({})
const helper = createColumnHelper<typeof features, AdminAccount>()
const columns = helper.columns([
  helper.accessor("email", { header: "Account" }),
  helper.accessor("status", { header: "Status" }),
  helper.accessor("apps", { header: "Apps" }),
])

/** A real table on wide screens, a list of cards on phones. */
export function AccountsTable({
  accounts,
  selfId,
  onAction,
}: {
  accounts: AdminAccount[]
  selfId: string
  onAction: (target: ActionTarget) => void
}) {
  const table = useTable({ features, columns, data: accounts })
  const rows = table.getRowModel().rows

  return (
    <>
      <ul className="divide-y rounded-xl border md:hidden" aria-label="Accounts">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <Identity account={row.original} isSelf={row.original.id === selfId} />
              </div>
              {row.original.id === selfId ? null : (
                <AccountActionsMenu account={row.original} onAction={onAction} />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={row.original.status} />
              <AppChips apps={row.original.apps} />
            </div>
            <PendingPassword account={row.original} />
          </li>
        ))}
      </ul>

      <div className="hidden rounded-xl border md:block">
        <Table aria-label="Accounts">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Account</TableHead>
              <TableHead className="w-80">Status</TableHead>
              <TableHead className="w-56">Apps</TableHead>
              <TableHead className="w-16">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-0 pl-4">
                  <Identity account={row.original} isSelf={row.original.id === selfId} />
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex flex-col items-start gap-2">
                    <StatusBadge status={row.original.status} />
                    <PendingPassword account={row.original} />
                  </div>
                </TableCell>
                <TableCell>
                  <AppChips apps={row.original.apps} />
                </TableCell>
                <TableCell className="text-right">
                  {row.original.id === selfId ? null : (
                    <AccountActionsMenu account={row.original} onAction={onAction} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

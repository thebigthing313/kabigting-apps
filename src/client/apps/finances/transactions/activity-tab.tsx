import { cn } from "cn"
import { ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import { type ReconciledTo, useReconciledTo } from "@/apps/finances/transactions/reconcile-choices"
import { EditTransactionDialog } from "@/apps/finances/transactions/transaction-dialogs"
import { categoryLabel, transactionLabel } from "@/apps/finances/transactions/transaction-display"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useCategories } from "@/data/finances-categories"
import { type Transaction, useActivity, useOutstandingOneOffs } from "@/data/finances-transactions"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate, today } from "@shared/dates"
import { toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

const PAGE_SIZE = 25

type Names = {
  account: ReadonlyMap<string, string>
  category: ReadonlyMap<string, string>
  /** What each Reconciled Actual is Reconciled to, by its id. */
  reconciledTo: ReadonlyMap<string, ReconciledTo>
}

/**
 * A Wallet's Activity: its outstanding one-off Planned items, then its Actuals newest first, a
 * page at a time. Each row opens its editor.
 */
export function ActivityTab({ wallet }: { wallet: Wallet }) {
  const [count, setCount] = useState(PAGE_SIZE)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const { oneOffs, isLoading: oneOffsLoading } = useOutstandingOneOffs(wallet.id)
  // One more than shown, to know whether there are older ones.
  const { data: actuals, isLoading } = useActivity(wallet.id, count)
  const { data: accounts } = useFinancesAccounts()
  const { data: categories } = useCategories()
  const reconciledTo = useReconciledTo(wallet.id)
  const names: Names = {
    account: new Map(accounts.map((account) => [account.id, account.name])),
    category: new Map(categories.map((category) => [category.id, category.name])),
    reconciledTo,
  }
  const now = today()

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="upcoming-one-offs" className="flex flex-col gap-2">
        <h2 id="upcoming-one-offs" className="font-medium">
          Upcoming one-offs
        </h2>
        {oneOffsLoading && oneOffs.length === 0 ? (
          <Skeleton className="h-14" />
        ) : oneOffs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one-off Planned items. Add one with the + button.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border" aria-label="Upcoming one-offs">
            {oneOffs.map((row) => (
              <TransactionItem
                key={row.id}
                row={row}
                wallet={wallet}
                names={names}
                overdue={row.date < now}
                onOpen={setEditing}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="actuals" className="flex flex-col gap-2">
        <h2 id="actuals" className="font-medium">
          Actuals
        </h2>
        {isLoading && actuals.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : actuals.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-muted-foreground">
            No Actuals yet. Add what really moved with the + button.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border" aria-label="Actuals">
            {actuals.slice(0, count).map((row) => (
              <TransactionItem
                key={row.id}
                row={row}
                wallet={wallet}
                names={names}
                overdue={false}
                onOpen={setEditing}
              />
            ))}
          </ul>
        )}
        {actuals.length > count ? (
          <Button
            variant="outline"
            className="h-11 self-center"
            onClick={() => setCount((current) => current + PAGE_SIZE)}
          >
            Show older Actuals
          </Button>
        ) : null}
      </section>

      <EditTransactionDialog transaction={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function TransactionItem({
  row,
  wallet,
  names,
  overdue,
  onOpen,
}: {
  row: Transaction
  wallet: Wallet
  names: Names
  overdue: boolean
  onOpen: (row: Transaction) => void
}) {
  const shown = toShown(wallet, row.amountCents)
  const label = transactionLabel(row, names.account)
  const reconciledTo = names.reconciledTo.get(row.id)
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row)}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{label}</p>
          <p className="truncate text-sm text-muted-foreground">
            {formatDisplayDate(row.date)} · {categoryLabel(row, names.category)}
            {reconciledTo === undefined ? null : ` · Reconciled to ${reconciledTo.label}`}
            {overdue ? (
              <span className="text-amber-700 dark:text-amber-400"> · Overdue</span>
            ) : null}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-sm font-medium tabular-nums",
            shown > 0 && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {format(shown, { sign: "always" })}
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </button>
    </li>
  )
}

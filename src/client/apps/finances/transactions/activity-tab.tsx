import { cn } from "cn"
import { ChevronRightIcon } from "lucide-react"
import { useState } from "react"
import { IgnoredLinesDialog } from "@/apps/finances/transactions/ignored-lines-dialog"
import {
  type ActivityRow,
  EditActivityDialog,
} from "@/apps/finances/transactions/transaction-dialogs"
import {
  categoryLabel,
  transactionLabel,
  transferLabel,
} from "@/apps/finances/transactions/transaction-display"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useCategories } from "@/data/finances-categories"
import { useActivity, useOutstandingOneOffs } from "@/data/finances-transactions"
import { useOutstandingPlannedTransfers, useTransferActivity } from "@/data/finances-transfers"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { formatDisplayDate, today } from "@shared/dates"
import { transferAmountOn } from "@shared/finances/transfers"
import { toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

const PAGE_SIZE = 25

type Names = {
  account: ReadonlyMap<string, string>
  category: ReadonlyMap<string, string>
  wallet: ReadonlyMap<string, string>
}

/** Transactions and Transfers in one list, by date (then id, as the server pages them). */
function byDate(
  transactions: ActivityRow[],
  transfers: ActivityRow[],
  direction: "asc" | "desc",
): ActivityRow[] {
  const sign = direction === "asc" ? 1 : -1
  return [...transactions, ...transfers].toSorted(
    (a, b) => sign * (a.row.date.localeCompare(b.row.date) || a.row.id.localeCompare(b.row.id)),
  )
}

/**
 * A Wallet's Activity: its outstanding one-off Planned items, then its Actuals and Transfers
 * newest first, a page at a time. A Transfer shows in both of its Wallets. Each row opens its
 * editor. Uploaded lines someone deleted are listed apart.
 */
export function ActivityTab({ wallet }: { wallet: Wallet }) {
  const [count, setCount] = useState(PAGE_SIZE)
  const [editing, setEditing] = useState<ActivityRow | null>(null)
  const [showIgnored, setShowIgnored] = useState(false)
  const { oneOffs, isLoading: oneOffsLoading } = useOutstandingOneOffs(wallet.id)
  const { plannedTransfers, isLoading: plannedTransfersLoading } = useOutstandingPlannedTransfers(
    wallet.id,
  )
  // One more than shown of each, to know whether there are older ones.
  const { data: actuals, isLoading: actualsLoading } = useActivity(wallet.id, count)
  const { data: transfers, isLoading: transfersLoading } = useTransferActivity(wallet.id, count)
  const { data: accounts } = useFinancesAccounts()
  const { data: categories } = useCategories()
  const { data: wallets } = useWallets()
  const names: Names = {
    account: new Map(accounts.map((account) => [account.id, account.name])),
    category: new Map(categories.map((category) => [category.id, category.name])),
    wallet: new Map(wallets.map((each) => [each.id, each.name])),
  }
  const now = today()
  const upcoming = byDate(
    oneOffs.map((row) => ({ kind: "transaction", row })),
    plannedTransfers.map((row) => ({ kind: "transfer", row })),
    "asc",
  )
  const past = byDate(
    actuals.map((row) => ({ kind: "transaction", row })),
    transfers.map((row) => ({ kind: "transfer", row })),
    "desc",
  )
  const upcomingLoading = oneOffsLoading || plannedTransfersLoading
  const pastLoading = actualsLoading || transfersLoading

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="upcoming-one-offs" className="flex flex-col gap-2">
        <h2 id="upcoming-one-offs" className="font-medium">
          Upcoming one-offs
        </h2>
        {upcomingLoading && upcoming.length === 0 ? (
          <Skeleton className="h-14" />
        ) : upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No one-off Planned items. Add one with the + button.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border" aria-label="Upcoming one-offs">
            {upcoming.map((item) => (
              <ActivityItem
                key={`${item.kind}:${item.row.id}`}
                item={item}
                wallet={wallet}
                names={names}
                overdue={item.row.date < now}
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
        {pastLoading && past.length === 0 ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : past.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-muted-foreground">
            No Actuals yet. Add what really moved with the + button.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border" aria-label="Actuals">
            {past.slice(0, count).map((item) => (
              <ActivityItem
                key={`${item.kind}:${item.row.id}`}
                item={item}
                wallet={wallet}
                names={names}
                overdue={false}
                onOpen={setEditing}
              />
            ))}
          </ul>
        )}
        {past.length > count ? (
          <Button
            variant="outline"
            className="h-11 self-center"
            onClick={() => setCount((current) => current + PAGE_SIZE)}
          >
            Show older Actuals
          </Button>
        ) : null}
        <Button
          variant="link"
          className="h-11 self-start px-0 text-muted-foreground"
          onClick={() => setShowIgnored(true)}
        >
          Ignored lines
        </Button>
      </section>

      <EditActivityDialog editing={editing} onClose={() => setEditing(null)} />
      <IgnoredLinesDialog wallet={wallet} open={showIgnored} onOpenChange={setShowIgnored} />
    </div>
  )
}

function ActivityItem({
  item,
  wallet,
  names,
  overdue,
  onOpen,
}: {
  item: ActivityRow
  wallet: Wallet
  names: Names
  overdue: boolean
  onOpen: (item: ActivityRow) => void
}) {
  // A Transfer is neither spending nor income: it has no Category, only its other Wallet.
  const { label, detail, cents } =
    item.kind === "transfer"
      ? {
          label: transferLabel(item.row, wallet.id, names.wallet),
          detail: "Transfer",
          cents: transferAmountOn(item.row, wallet.id),
        }
      : {
          label: transactionLabel(item.row, names.account),
          detail: categoryLabel(item.row, names.category),
          cents: item.row.amountCents,
        }
  const shown = toShown(wallet, cents)
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{label}</p>
          <p className="truncate text-sm text-muted-foreground">
            {formatDisplayDate(item.row.date)} · {detail}
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

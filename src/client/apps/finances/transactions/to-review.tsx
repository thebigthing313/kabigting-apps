import { cn } from "cn"
import { useState } from "react"
import { toast } from "sonner"
import {
  PlannedChoices,
  PlannedSummary,
  reconcileBody,
  useOutstandingPlanned,
} from "@/apps/finances/transactions/reconcile-choices"
import { categoryLabel, transactionLabel } from "@/apps/finances/transactions/transaction-display"
import { Button } from "@/components/ui/button"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useCategories } from "@/data/finances-categories"
import {
  confirmSameAsHandEntry,
  markLinesReviewed,
  reconcileActual,
  type Transaction,
  useWalletActualsBetween,
} from "@/data/finances-transactions"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import { datesAround, reviewSuggestion, TWIN_WINDOW_DAYS } from "@shared/finances/reconcile"
import { toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

type Names = { account: ReadonlyMap<string, string>; category: ReadonlyMap<string, string> }

/**
 * To review: a Wallet's uploaded lines that had a suggestion when they arrived. Each shows its
 * best suggestion (a hand entry it repeats, else a suggested Planned item) with Confirm, Pick another and
 * Unplanned. Hidden when nothing waits.
 */
export function ToReviewPanel({
  wallet,
  lines,
}: {
  wallet: Wallet
  lines: readonly Transaction[]
}) {
  const handEntered = useWalletActualsBetween(wallet.id, datesAround(lines, TWIN_WINDOW_DAYS))
  const { data: accounts } = useFinancesAccounts()
  const { data: categories } = useCategories()
  const names: Names = {
    account: new Map(accounts.map((account) => [account.id, account.name])),
    category: new Map(categories.map((category) => [category.id, category.name])),
  }
  if (lines.length === 0) return null
  return (
    <section aria-labelledby="to-review" className="flex flex-col gap-2">
      <h2 id="to-review" className="font-medium">
        To review
      </h2>
      <ul className="divide-y rounded-xl border" aria-label="To review">
        {lines.map((line) => (
          <ReviewItem
            key={line.id}
            line={line}
            wallet={wallet}
            handEntered={handEntered}
            names={names}
          />
        ))}
      </ul>
    </section>
  )
}

function ReviewItem({
  line,
  wallet,
  handEntered,
  names,
}: {
  line: Transaction
  wallet: Wallet
  handEntered: readonly Transaction[]
  names: Names
}) {
  const outstanding = useOutstandingPlanned(wallet.id, line.date)
  const suggestion = reviewSuggestion(line, { outstanding, handEntered })
  const [picking, setPicking] = useState(false)
  const [pending, setPending] = useState(false)
  const shown = toShown(wallet, line.amountCents)

  async function run(command: () => Promise<boolean>, done: string) {
    setPending(true)
    const ok = await command()
    setPending(false)
    if (ok) toast.success(done)
  }

  function confirm() {
    if (suggestion?.kind === "twin") {
      void run(
        () => confirmSameAsHandEntry(line.id, suggestion.handEntry.id),
        "Kept the uploaded line",
      )
    } else if (suggestion?.kind === "planned") {
      void run(() => reconcileActual(reconcileBody(suggestion.item, line.id)), "Reconciled")
    }
  }

  return (
    // Its suggestion loads after the line; the row keeps its height meanwhile.
    <li className="flex min-h-36 flex-col gap-3 p-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{transactionLabel(line, names.account)}</p>
          <p className="truncate text-sm text-muted-foreground">{formatDisplayDate(line.date)}</p>
        </div>
        <span
          className={cn(
            "shrink-0 text-sm font-medium tabular-nums",
            shown > 0 && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {format(shown, { sign: "always" })}
        </span>
      </div>

      {suggestion?.kind === "twin" ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <p className="font-medium">Same as your hand entry?</p>
          <p className="truncate text-muted-foreground">
            {transactionLabel(suggestion.handEntry, names.account)} ·{" "}
            {categoryLabel(suggestion.handEntry, names.category)} ·{" "}
            {formatDisplayDate(suggestion.handEntry.date)}
          </p>
        </div>
      ) : suggestion?.kind === "planned" ? (
        <div className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <p className="font-medium">Reconcile to this?</p>
          <PlannedSummary item={suggestion.item} wallet={wallet} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing Planned to suggest.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {suggestion ? (
          <Button className="h-11" disabled={pending} onClick={confirm}>
            Confirm
          </Button>
        ) : null}
        <Button
          variant="outline"
          className="h-11"
          disabled={pending}
          aria-expanded={picking}
          onClick={() => setPicking((current) => !current)}
        >
          Pick another
        </Button>
        <Button
          variant="ghost"
          className="h-11"
          disabled={pending}
          onClick={() => void run(() => markLinesReviewed([line.id]), "Marked unplanned")}
        >
          Unplanned
        </Button>
      </div>

      {picking ? (
        <PlannedChoices
          actual={line}
          outstanding={outstanding}
          wallet={wallet}
          disabled={pending}
          onPick={(item) =>
            void run(() => reconcileActual(reconcileBody(item, line.id)), "Reconciled")
          }
        />
      ) : null}
    </li>
  )
}

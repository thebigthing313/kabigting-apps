import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { BalanceCheckDialog } from "@/apps/finances/wallets/balance-check-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useBalanceChecks, usePreviousBalanceCheck } from "@/data/finances-balance-checks"
import { useActualsSince } from "@/data/finances-transactions"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import { compareToComputed } from "@shared/finances/balance-checks"
import { formatOffBy, formatShown } from "@shared/finances/wallets"

const PAGE_SIZE = 20

/** A Wallet's Balance checks, newest first, a page at a time, each against its computed balance. */
export function BalanceChecksTab({ wallet }: { wallet: Wallet }) {
  const [entering, setEntering] = useState(false)
  const {
    data: shown,
    isLoading,
    hasNextPage,
    fetchNextPage,
  } = useBalanceChecks(wallet.id, PAGE_SIZE)
  // The oldest shown check is compared with the one before it, which is not shown yet.
  const { check: beforeOldest, isLoading: beforeLoading } = usePreviousBalanceCheck(
    wallet.id,
    shown.at(-1)?.date,
  )
  // The shown checks, then the one before the oldest: what each shown check is compared with.
  const compared = beforeOldest === undefined ? shown : [...shown, beforeOldest]
  // Each shown check is compared with the one before it, so the Actuals since the oldest loaded.
  const { actuals, isLoading: actualsLoading } = useActualsSince(wallet.id, compared.at(-1)?.date)

  return (
    <div className="flex flex-col gap-4">
      <Button className="h-11 self-start" onClick={() => setEntering(true)}>
        <PlusIcon />
        Enter Balance check
      </Button>

      {isLoading && shown.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          No Balance checks yet. Enter the balance the bank shows to start this Wallet&apos;s
          balance.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Balance checks">
          {shown.map((check, index) => {
            // Compared only once the Actuals are in, so no false "off by" shows meanwhile.
            const comparison =
              actualsLoading || beforeLoading
                ? null
                : compareToComputed(check, compared[index + 1], actuals)
            return (
              <li
                key={check.id}
                className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2"
              >
                <span>{formatDisplayDate(check.date)}</span>
                <span className="flex flex-col items-end">
                  <span className="font-medium">{formatShown(wallet, check.amountCents)}</span>
                  {comparison && comparison.offByCents !== 0 ? (
                    <span className="text-sm text-muted-foreground">
                      {formatOffBy(wallet, comparison.offByCents)}
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {hasNextPage ? (
        <Button variant="outline" className="h-11 self-center" onClick={() => void fetchNextPage()}>
          Show older checks
        </Button>
      ) : null}

      <BalanceCheckDialog open={entering} onOpenChange={setEntering} walletId={wallet.id} />
    </div>
  )
}

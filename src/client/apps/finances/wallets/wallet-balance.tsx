import { Skeleton } from "@/components/ui/skeleton"
import {
  type BalanceCheck,
  NO_ACTUALS_YET,
  useLatestBalanceCheck,
} from "@/data/finances-balance-checks"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import { balanceSince } from "@shared/finances/balance-checks"
import { formatShown } from "@shared/finances/wallets"

/** The balance from the latest check: the check plus the Actuals since. */
function balanceText(wallet: Wallet, check: BalanceCheck): string {
  return formatShown(wallet, balanceSince(check, NO_ACTUALS_YET))
}

/** The Wallet page's balance in large type, with its last check date. */
export function WalletBalance({ wallet }: { wallet: Wallet }) {
  const { check, isLoading } = useLatestBalanceCheck(wallet.id)
  if (isLoading) return <Skeleton className="h-10 w-40" />
  if (!check) {
    return <p className="text-3xl font-semibold text-muted-foreground">No Balance check</p>
  }
  return (
    <div>
      <p className="text-3xl font-semibold break-words">{balanceText(wallet, check)}</p>
      <p className="text-sm text-muted-foreground">
        Last Balance check {formatDisplayDate(check.date)}
      </p>
    </div>
  )
}

/**
 * The Wallets list's balance details: "$1,250.00 · checked Oct 1, 2026", or "No Balance check".
 * Undefined while loading.
 */
export function useBalanceDetails(wallet: Wallet): string[] | undefined {
  const { check, isLoading } = useLatestBalanceCheck(wallet.id)
  if (isLoading) return undefined
  if (!check) return ["No Balance check"]
  return [balanceText(wallet, check), `checked ${formatDisplayDate(check.date)}`]
}

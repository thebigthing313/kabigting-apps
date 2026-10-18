import { Skeleton } from "@/components/ui/skeleton"
import { useLatestBalanceCheck } from "@/data/finances-balance-checks"
import { useActualsSince } from "@/data/finances-transactions"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import { balanceSince } from "@shared/finances/balance-checks"
import { formatShown } from "@shared/finances/wallets"

/** The Wallet's latest check and its balance now: the check plus the Actuals since. */
function useBalance(wallet: Wallet) {
  const { check, isLoading } = useLatestBalanceCheck(wallet.id)
  const { actuals, isLoading: actualsLoading } = useActualsSince(wallet.id, check?.date)
  return {
    check,
    text: check ? formatShown(wallet, balanceSince(check, actuals)) : undefined,
    isLoading: isLoading || actualsLoading,
  }
}

/** The Wallet page's balance in large type, with its last check date. */
export function WalletBalance({ wallet }: { wallet: Wallet }) {
  const { check, text, isLoading } = useBalance(wallet)
  if (isLoading) return <Skeleton className="h-10 w-40" />
  if (!check) {
    return <p className="text-3xl font-semibold text-muted-foreground">No Balance check</p>
  }
  return (
    <div>
      <p className="text-3xl font-semibold break-words">{text}</p>
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
  const { check, text, isLoading } = useBalance(wallet)
  if (isLoading) return undefined
  if (!check || text === undefined) return ["No Balance check"]
  return [text, `checked ${formatDisplayDate(check.date)}`]
}

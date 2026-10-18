import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { useId } from "react"
import {
  forecastItemKey,
  isOverdue,
  useWalletForecast,
} from "@/apps/finances/home/use-wallet-forecast"
import { ForecastWarnings, ItemAmount } from "@/apps/finances/home/wallet-forecast"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useLatestBalanceCheck } from "@/data/finances-balance-checks"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import type { ForecastHorizon } from "@shared/finances/forecast"
import { formatShown } from "@shared/finances/wallets"

/** How many coming items a forecast Wallet's card lists. */
const NEXT_ITEMS = 3

const CARD = "flex flex-col gap-3 rounded-xl border p-4"

/**
 * Home's All tab: one card per Wallet. A forecast Wallet's card opens its
 * tab; any other Wallet's card is greyed. The cards stack on a phone.
 */
export function AllWallets({
  wallets,
  days,
  onEnterBalance,
}: {
  /** The household's Wallets, archived ones left out. */
  wallets: readonly Wallet[]
  days: ForecastHorizon
  onEnterBalance: (walletId: string) => void
}) {
  if (wallets.length === 0) {
    return (
      <p className="rounded-xl border p-6 text-center text-muted-foreground">
        No Wallets yet. Add one in{" "}
        <Link to="/finances/wallets" className="underline">
          Wallets
        </Link>{" "}
        to see it here.
      </p>
    )
  }
  return (
    <ul aria-label="Wallets" className="grid gap-3 md:grid-cols-2">
      {wallets.map((wallet) => (
        <li key={wallet.id} className="flex min-w-0 flex-col">
          {wallet.inForecast ? (
            <ForecastCard wallet={wallet} days={days} onEnterBalance={onEnterBalance} />
          ) : (
            <OutsideCard wallet={wallet} />
          )}
        </li>
      ))}
    </ul>
  )
}

function ForecastCard({
  wallet,
  days,
  onEnterBalance,
}: {
  wallet: Wallet
  days: ForecastHorizon
  onEnterBalance: (walletId: string) => void
}) {
  const { result, isLoading, labelOf } = useWalletForecast(wallet, days)
  const nameId = useId()

  if (isLoading) return <Skeleton className="h-40" />
  if (!result) {
    return (
      <section aria-labelledby={nameId} className={cn(CARD, "flex-1")}>
        <h2 id={nameId} className="font-medium">
          {wallet.name}
        </h2>
        <p className="text-sm text-muted-foreground">No Forecast until its first Balance check.</p>
        <Button variant="outline" className="h-11" onClick={() => onEnterBalance(wallet.id)}>
          Enter balance
        </Button>
      </section>
    )
  }

  const shown = (cents: number) => formatShown(wallet, cents)
  const { low } = result
  const items = result.days.flatMap((day) => day.items).filter((item) => item.kind !== "actual")
  const overdue = items.filter(isOverdue).length

  return (
    <Link
      to="/finances"
      search={(previous) => ({ ...previous, wallet: wallet.id })}
      aria-labelledby={nameId}
      className={cn(CARD, "flex-1 hover:bg-muted/50")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={nameId} className="truncate font-medium">
            {wallet.name}
          </h2>
          {overdue > 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">{overdue} Overdue</p>
          ) : null}
        </div>
        <p
          className={cn(
            "shrink-0 text-2xl font-semibold tabular-nums",
            result.todayBalanceCents < 0 && "text-destructive",
          )}
        >
          {shown(result.todayBalanceCents)}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Lowest {shown(low.balanceCents)} on {formatDisplayDate(low.date)}
      </p>
      <ForecastWarnings wallet={wallet} forecast={result} worstOnly />
      {items.length > 0 ? (
        <ul aria-label="Next items" className="flex flex-col gap-1 text-sm">
          {items.slice(0, NEXT_ITEMS).map((item) => (
            <li key={forecastItemKey(item)} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="text-muted-foreground">{formatDisplayDate(item.date)}</span>{" "}
                {labelOf(item)}
              </span>
              <ItemAmount wallet={wallet} cents={item.amountCents} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing planned in the next {days} days.</p>
      )}
    </Link>
  )
}

/** A Wallet outside the forecast: greyed, with its latest Balance check if it has one. */
function OutsideCard({ wallet }: { wallet: Wallet }) {
  const { check } = useLatestBalanceCheck(wallet.id)
  const nameId = useId()
  return (
    <section
      aria-labelledby={nameId}
      className={cn(CARD, "flex-1 border-dashed bg-muted/40 text-muted-foreground")}
    >
      <h2 id={nameId} className="font-medium">
        {wallet.name}
      </h2>
      <p className="text-sm">Not in the forecast</p>
      {check ? (
        <p className="text-sm">
          Balance check {formatShown(wallet, check.amountCents)} on {formatDisplayDate(check.date)}
        </p>
      ) : null}
    </section>
  )
}

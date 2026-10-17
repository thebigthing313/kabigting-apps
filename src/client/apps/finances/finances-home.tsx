import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { useState } from "react"
import { WalletForecast } from "@/apps/finances/home/wallet-forecast"
import { BalanceCheckDialog } from "@/apps/finances/wallets/balance-check-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useLatestBalanceCheck } from "@/data/finances-balance-checks"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import type { ForecastHorizon } from "@shared/finances/forecast"

/**
 * The Finances home: a tab per forecast Wallet, and the selected Wallet's Forecast. A forecast
 * Wallet with no Balance check shows as a dashed tab that asks for one.
 */
export function FinancesHome({
  walletId,
  days,
}: {
  /** The selected Wallet's tab; the first forecast Wallet when absent or not in the forecast. */
  walletId?: string
  days: ForecastHorizon
}) {
  const { data: wallets, isLoading } = useWallets()
  const forecastWallets = wallets.filter((wallet) => wallet.inForecast && !wallet.archived)
  const selected =
    forecastWallets.find((wallet) => wallet.id === walletId) ?? forecastWallets[0] ?? null
  // The Wallet is kept while the dialog closes, so it never flips to another as it fades.
  const [entering, setEntering] = useState<{ open: boolean; walletId?: string }>({ open: false })
  const enterBalance = (id: string) => setEntering({ open: true, walletId: id })

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-8">
      <h1 className="text-2xl font-semibold">Finances</h1>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : selected === null ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          No Wallets are in the forecast yet. Turn on “In the forecast” for a Wallet in{" "}
          <Link to="/finances/wallets" className="underline">
            Wallets
          </Link>{" "}
          to see its Forecast here.
        </p>
      ) : (
        <>
          {/* The tabs scroll sideways on a phone rather than widening the page. */}
          <nav aria-label="Forecast Wallets" className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {forecastWallets.map((wallet) => (
              <WalletTab
                key={wallet.id}
                wallet={wallet}
                selected={wallet.id === selected.id}
                onEnterBalance={enterBalance}
              />
            ))}
          </nav>
          <WalletForecast
            key={selected.id}
            wallet={selected}
            days={days}
            onEnterBalance={enterBalance}
          />
        </>
      )}
      {/* One dialog for the page: a tab asking for a check turns into a plain tab once it is
          saved, and the dialog must outlive that to show the result. */}
      <BalanceCheckDialog
        open={entering.open}
        onOpenChange={(open) => setEntering((previous) => ({ ...previous, open }))}
        walletId={entering.walletId}
      />
    </div>
  )
}

const TAB = "flex h-11 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap"

function WalletTab({
  wallet,
  selected,
  onEnterBalance,
}: {
  wallet: Wallet
  selected: boolean
  onEnterBalance: (walletId: string) => void
}) {
  const { check, isLoading } = useLatestBalanceCheck(wallet.id)

  if (!isLoading && !check) {
    return (
      <button
        type="button"
        onClick={() => onEnterBalance(wallet.id)}
        aria-label={`Enter balance for ${wallet.name}`}
        className={cn(TAB, "gap-1 border-dashed text-muted-foreground")}
      >
        {wallet.name} · Enter balance
      </button>
    )
  }
  return (
    <Link
      to="/finances"
      search={(previous) => ({ ...previous, wallet: wallet.id })}
      aria-current={selected ? "page" : undefined}
      className={cn(TAB, selected && "border-primary bg-primary text-primary-foreground")}
    >
      {wallet.name}
    </Link>
  )
}

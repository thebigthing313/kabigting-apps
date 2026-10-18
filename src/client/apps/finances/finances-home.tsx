import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { EllipsisVerticalIcon, PinIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { AddButton } from "@/apps/finances/add-button"
import { AllWallets } from "@/apps/finances/home/all-wallets"
import { ALL_TAB, openOnHomeTab, selectedTab } from "@/apps/finances/home/home-tab"
import { WalletForecast } from "@/apps/finances/home/wallet-forecast"
import { BalanceCheckDialog } from "@/apps/finances/wallets/balance-check-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useLatestBalanceCheck } from "@/data/finances-balance-checks"
import { setOpenOnHome, useOpenOnHome } from "@/data/finances-settings"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import type { ForecastHorizon } from "@shared/finances/forecast"

/**
 * The Finances home: an All tab of Wallet cards, then a tab per forecast Wallet with its Forecast.
 * A forecast Wallet with no Balance check shows as a dashed tab that asks for one. With no tab in
 * the address, home opens on the household's "Open here by default" choice.
 */
export function FinancesHome({
  walletId,
  days,
}: {
  /** `?wallet=`: "all", a forecast Wallet's id, or absent for the household's default. */
  walletId?: string
  days: ForecastHorizon
}) {
  const { data: wallets, isLoading } = useWallets()
  const { walletId: openOnHome, isLoading: settingsLoading } = useOpenOnHome()
  const active = wallets.filter((wallet) => !wallet.archived)
  const forecastWallets = active.filter((wallet) => wallet.inForecast)
  const forecastWalletIds = forecastWallets.map((wallet) => wallet.id)
  const tab = selectedTab({ tab: walletId, openOnHome, forecastWalletIds })
  const selected = forecastWallets.find((wallet) => wallet.id === tab) ?? null
  const pinned = openOnHomeTab(openOnHome, forecastWalletIds)
  // The Wallet is kept while the dialog closes, so it never flips to another as it fades.
  const [entering, setEntering] = useState<{ open: boolean; walletId?: string }>({ open: false })
  const enterBalance = (id: string) => setEntering({ open: true, walletId: id })

  return (
    // Room at the foot for the + button.
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      <h1 className="text-2xl font-semibold">Finances</h1>
      {isLoading || settingsLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {/* The tabs scroll sideways on a phone rather than widening the page. `relative` keeps
              their screen-reader-only text, which is positioned absolutely, inside that scroll. */}
          <nav
            aria-label="Forecast Wallets"
            className="relative -mx-1 flex items-center gap-1 overflow-x-auto px-1"
          >
            <HomeTab
              name="All"
              tab={ALL_TAB}
              selected={tab === ALL_TAB}
              pinned={pinned === ALL_TAB}
            />
            {forecastWallets.map((wallet) => (
              <WalletTab
                key={wallet.id}
                wallet={wallet}
                selected={wallet.id === tab}
                pinned={wallet.id === pinned}
                onEnterBalance={enterBalance}
              />
            ))}
          </nav>
          {selected ? (
            <WalletForecast
              key={selected.id}
              wallet={selected}
              days={days}
              onEnterBalance={enterBalance}
            />
          ) : (
            <AllWallets wallets={active} days={days} onEnterBalance={enterBalance} />
          )}
        </>
      )}
      {/* One dialog for the page: a tab asking for a check turns into a plain tab once it is
          saved, and the dialog must outlive that to show the result. */}
      <BalanceCheckDialog
        open={entering.open}
        onOpenChange={(open) => setEntering((previous) => ({ ...previous, open }))}
        walletId={entering.walletId}
      />
      <AddButton walletId={selected?.id} />
    </div>
  )
}

/** What a screen reader hears after the name of the tab home opens on by default. */
const PINNED = " (opens here by default)"

const TAB = "flex h-11 shrink-0 items-center rounded-full border px-4 text-sm whitespace-nowrap"

function WalletTab({
  wallet,
  selected,
  pinned,
  onEnterBalance,
}: {
  wallet: Wallet
  selected: boolean
  pinned: boolean
  onEnterBalance: (walletId: string) => void
}) {
  const { check, isLoading } = useLatestBalanceCheck(wallet.id)

  if (!isLoading && !check) {
    return (
      <button
        type="button"
        onClick={() => onEnterBalance(wallet.id)}
        aria-label={`Enter balance for ${wallet.name}${pinned ? PINNED : ""}`}
        className={cn(TAB, "gap-1 border-dashed text-muted-foreground")}
      >
        {wallet.name} · Enter balance
        {pinned ? <PinIcon aria-hidden className="size-3.5" /> : null}
      </button>
    )
  }
  return <HomeTab name={wallet.name} tab={wallet.id} selected={selected} pinned={pinned} />
}

/**
 * One tab: a link to it, a pin when home opens there by default, and, while selected, its
 * overflow menu.
 */
function HomeTab({
  name,
  tab,
  selected,
  pinned,
}: {
  name: string
  /** ALL_TAB or a forecast Wallet's id. */
  tab: string
  selected: boolean
  pinned: boolean
}) {
  return (
    <>
      <Link
        to="/finances"
        search={(previous) => ({ ...previous, wallet: tab })}
        aria-current={selected ? "page" : undefined}
        className={cn(
          TAB,
          "gap-1",
          selected && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {name}
        {pinned ? (
          <>
            <PinIcon aria-hidden className="size-3.5" />
            <span className="sr-only">{PINNED}</span>
          </>
        ) : null}
      </Link>
      {selected ? <TabMenu name={name} tab={tab} pinned={pinned} /> : null}
    </>
  )
}

function TabMenu({ name, tab, pinned }: { name: string; tab: string; pinned: boolean }) {
  const openHere = async () => {
    if (await setOpenOnHome(tab === ALL_TAB ? null : tab)) {
      toast.success(`Finances now opens on ${name}`)
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" className="size-11 shrink-0" />}
      >
        <EllipsisVerticalIcon />
        <span className="sr-only">More for {name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuItem className="min-h-11" disabled={pinned} onClick={() => void openHere()}>
          <PinIcon />
          {pinned ? "Opens here by default" : "Open here by default"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

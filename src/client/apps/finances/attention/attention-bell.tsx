import { BellIcon } from "lucide-react"
import { useCallback, useEffect, useId, useState } from "react"
import { AttentionItemRow } from "@/apps/finances/attention/attention-item"
import {
  attentionKey,
  type NamedItem,
  useForecastWalletAttention,
  useOutsideWalletAttention,
} from "@/apps/finances/attention/use-attention"
import { BalanceCheckDialog } from "@/apps/finances/wallets/balance-check-dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { DEFAULT_HORIZON, type ForecastHorizon } from "@shared/finances/forecast"

type Report = (walletId: string, count: number) => void

/**
 * The notifications bell in every Finances page header. Its count is the number of items it
 * lists, grouped by Wallet: lines To review, Overdue items, forecast Wallets with no Balance
 * check, and low-balance warnings within the horizon. Each item opens where it is fixed.
 */
export function AttentionBell({ days = DEFAULT_HORIZON }: { days?: ForecastHorizon | undefined }) {
  const { data: wallets } = useWallets()
  const [open, setOpen] = useState(false)
  // Each Wallet's count comes from a group that renders nothing, so it is there while the bell is
  // closed; the list, built the same way from the same data, is there only while it is open.
  const [counts, setCounts] = useState<Record<string, number>>({})
  // Stable, so a count is reported again only when it changes.
  const report = useCallback<Report>(
    (walletId, count) =>
      setCounts((previous) =>
        (previous[walletId] ?? 0) === count ? previous : { ...previous, [walletId]: count },
      ),
    [],
  )
  // The Wallet is kept while the dialog closes, so it never flips to another as it fades.
  const [entering, setEntering] = useState<{ open: boolean; walletId?: string }>({ open: false })
  const active = wallets.filter((wallet) => !wallet.archived)
  const total = active.reduce((sum, wallet) => sum + (counts[wallet.id] ?? 0), 0)
  const label = total === 0 ? "Notifications" : `Notifications, ${total} items`

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={<Button variant="ghost" size="icon" className="relative size-11 shrink-0" />}
          aria-label={label}
        >
          <BellIcon />
          {total > 0 ? (
            <span
              aria-hidden
              className="absolute top-1 right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-white tabular-nums"
            >
              {total}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          aria-label="Notifications"
          className="max-h-[min(32rem,var(--available-height))] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto"
        >
          {total === 0 ? (
            <p className="p-2 text-muted-foreground">Nothing needs attention.</p>
          ) : null}
          {active.map((wallet) => (
            <WalletGroup
              key={wallet.id}
              wallet={wallet}
              days={days}
              listing={counts[wallet.id] ?? 0}
              onEnterBalance={(walletId) => setEntering({ open: true, walletId })}
              onOpen={() => setOpen(false)}
            />
          ))}
        </PopoverContent>
      </Popover>
      {active.map((wallet) => (
        <WalletGroup key={wallet.id} wallet={wallet} days={days} report={report} />
      ))}
      <BalanceCheckDialog
        open={entering.open}
        onOpenChange={(next) => setEntering((previous) => ({ ...previous, open: next }))}
        walletId={entering.walletId}
      />
    </>
  )
}

type GroupProps = { wallet: Wallet; days: ForecastHorizon } & (
  | {
      /** Only counts the Wallet's items, rendering nothing. */
      report: Report
    }
  | {
      /** Lists the Wallet's items; while they load, this many (as counted) hold their place. */
      listing: number
      onEnterBalance: (walletId: string) => void
      onOpen: () => void
    }
)

function WalletGroup(props: GroupProps) {
  return props.wallet.inForecast ? <ForecastGroup {...props} /> : <OutsideGroup {...props} />
}

function ForecastGroup(props: GroupProps) {
  const { items, isLoading } = useForecastWalletAttention(props.wallet, props.days)
  return <Group {...props} items={items} isLoading={isLoading} />
}

function OutsideGroup(props: GroupProps) {
  const { items, isLoading } = useOutsideWalletAttention(props.wallet)
  return <Group {...props} items={items} isLoading={isLoading} />
}

function Group(props: GroupProps & { items: readonly NamedItem[]; isLoading: boolean }) {
  if ("report" in props) {
    return <Count walletId={props.wallet.id} count={props.items.length} report={props.report} />
  }
  if (props.isLoading) return props.listing > 0 ? <Skeleton className="h-20" /> : null
  return (
    <List
      wallet={props.wallet}
      days={props.days}
      items={props.items}
      onEnterBalance={props.onEnterBalance}
      onOpen={props.onOpen}
    />
  )
}

/** Tells the bell how many items a Wallet has; renders nothing. */
function Count({ walletId, count, report }: { walletId: string; count: number; report: Report }) {
  useEffect(() => {
    report(walletId, count)
    return () => report(walletId, 0)
  }, [report, walletId, count])
  return null
}

/** One Wallet's items under its name; nothing when it has none. */
function List({
  wallet,
  days,
  items,
  onEnterBalance,
  onOpen,
}: {
  wallet: Wallet
  days: ForecastHorizon
  items: readonly NamedItem[]
  onEnterBalance: (walletId: string) => void
  onOpen: () => void
}) {
  const headingId = useId()
  if (items.length === 0) return null
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2 id={headingId} className="px-2 pt-1 text-xs font-medium text-muted-foreground uppercase">
        {wallet.name}
      </h2>
      <ul className="flex flex-col">
        {items.map((named) => (
          <li key={attentionKey(named.item)}>
            <AttentionItemRow
              named={named}
              wallet={wallet}
              days={days}
              onEnterBalance={onEnterBalance}
              onOpen={onOpen}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

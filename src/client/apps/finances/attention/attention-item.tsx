import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { ChevronRightIcon } from "lucide-react"
import type { NamedItem } from "@/apps/finances/attention/use-attention"
import { UPCOMING_ONE_OFFS } from "@/apps/finances/transactions/activity-tab"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import type { AttentionItem } from "@shared/finances/attention"
import type { ForecastHorizon } from "@shared/finances/forecast"
import { formatShown, toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

/** The id of a day on a Wallet's home tab, which a low-balance item scrolls to. */
export function dayAnchor(date: string): string {
  return `day-${date}`
}

const ROW =
  "flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted"

/**
 * One attention item, opening where it is fixed: a line To review its Wallet's Activity, an Overdue
 * Occurrence its Schedule page with its editor open, an Overdue one-off its Wallet's Upcoming
 * one-offs, a missing Balance check the Balance check dialog, and a low balance the Wallet's home
 * tab at that day.
 */
export function AttentionItemRow({
  named: { item, label },
  wallet,
  days,
  onEnterBalance,
  onOpen,
}: {
  named: NamedItem
  wallet: Wallet
  /** The horizon a low-balance item was found in, kept when it opens home. */
  days: ForecastHorizon
  onEnterBalance: (walletId: string) => void
  /** Called as the item opens, such as to close the list it is in. */
  onOpen?: () => void
}) {
  const content = <ItemContent item={item} label={label} wallet={wallet} days={days} />

  if (item.kind === "noBalanceCheck") {
    return (
      <button
        type="button"
        onClick={() => {
          onOpen?.()
          onEnterBalance(item.walletId)
        }}
        className={ROW}
      >
        {content}
      </button>
    )
  }
  if (item.kind === "overdueOccurrence") {
    return (
      <Link
        to="/finances/schedules/$scheduleId"
        params={{ scheduleId: item.scheduleId }}
        search={{ occurrence: item.nominalDate }}
        onClick={onOpen}
        className={ROW}
      >
        {content}
      </Link>
    )
  }
  if (item.kind === "lowBalance") {
    return (
      <Link
        to="/finances"
        search={{ wallet: item.walletId, days }}
        hash={dayAnchor(item.date)}
        onClick={onOpen}
        className={ROW}
      >
        {content}
      </Link>
    )
  }
  // A line To review, or an Overdue one-off at Upcoming one-offs.
  return (
    <Link
      to="/finances/wallets/$walletId"
      params={{ walletId: item.walletId }}
      search={{ tab: "activity" }}
      hash={item.kind === "overdueOneOff" ? UPCOMING_ONE_OFFS : undefined}
      onClick={onOpen}
      className={ROW}
    >
      {content}
    </Link>
  )
}

/** What the item is, when, and its Amount as this Wallet shows it. */
function ItemContent({
  item,
  label,
  wallet,
  days,
}: {
  item: AttentionItem
  label: string
  wallet: Wallet
  days: ForecastHorizon
}) {
  const { title, detail, overdue } = describe(item, label, wallet, days)
  const cents = "amountCents" in item ? toShown(wallet, item.amountCents) : null
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{title}</span>
        <span
          className={cn(
            "truncate text-xs",
            overdue ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {detail}
        </span>
      </span>
      {cents === null ? null : (
        <span
          className={cn(
            "shrink-0 text-sm tabular-nums",
            cents > 0 && "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {format(cents, { sign: "always" })}
        </span>
      )}
      <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </>
  )
}

function describe(
  item: AttentionItem,
  label: string,
  wallet: Wallet,
  days: ForecastHorizon,
): { title: string; detail: string; overdue: boolean } {
  if (item.kind === "toReview") {
    return { title: label, detail: `To review · ${formatDisplayDate(item.date)}`, overdue: false }
  }
  if (item.kind === "overdueOccurrence" || item.kind === "overdueOneOff") {
    return { title: label, detail: `Overdue since ${formatDisplayDate(item.date)}`, overdue: true }
  }
  if (item.kind === "noBalanceCheck") {
    return {
      title: "No Balance check",
      detail: "Enter its balance to start its Forecast",
      overdue: false,
    }
  }
  return {
    title:
      item.under === "zero"
        ? `Below $0 on ${formatDisplayDate(item.date)}`
        : `Under the ${formatShown(wallet, item.thresholdCents)} threshold on ${formatDisplayDate(item.date)}`,
    detail: `Low balance in the next ${days} days`,
    overdue: false,
  }
}

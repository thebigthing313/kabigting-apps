import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react"
import { AttentionItemRow } from "@/apps/finances/attention/attention-item"
import { attentionKey, type NamedItem } from "@/apps/finances/attention/use-attention"
import type { Wallet } from "@/data/finances-wallets"
import { attentionCounts } from "@shared/finances/attention"
import type { ForecastHorizon } from "@shared/finances/forecast"

/**
 * A forecast Wallet's banner on its home tab: its To review and Overdue counts. To review opens
 * the Wallet's Activity; each Overdue item opens where it is fixed. Nothing when neither waits.
 */
export function AttentionBanner({
  wallet,
  items,
  days,
  onEnterBalance,
}: {
  wallet: Wallet
  /** This Wallet's attention items; only To review and Overdue ones show here. */
  items: readonly NamedItem[]
  days: ForecastHorizon
  onEnterBalance: (walletId: string) => void
}) {
  const counts = attentionCounts(items.map((named) => named.item))
  if (counts.toReview === 0 && counts.overdue === 0) return null
  const overdue = items.filter(
    ({ item }) => item.kind === "overdueOccurrence" || item.kind === "overdueOneOff",
  )
  const summary = [
    counts.toReview > 0 ? `${counts.toReview} To review` : null,
    counts.overdue > 0 ? `${counts.overdue} Overdue` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ")

  return (
    <section
      aria-label="Needs attention"
      className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <p className="flex items-center gap-2 px-2 pt-1 text-sm font-medium">
        <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-amber-700" />
        {summary}
      </p>
      <ul className="flex flex-col">
        {counts.toReview > 0 ? (
          <li>
            <Link
              to="/finances/wallets/$walletId"
              params={{ walletId: wallet.id }}
              search={{ tab: "activity" }}
              className="flex min-h-12 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
            >
              <span className="min-w-0 flex-1 font-medium">
                Review{" "}
                {counts.toReview === 1 ? "1 uploaded line" : `${counts.toReview} uploaded lines`}
              </span>
              <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ) : null}
        {overdue.map((named) => (
          <li key={attentionKey(named.item)}>
            <AttentionItemRow
              named={named}
              wallet={wallet}
              days={days}
              onEnterBalance={onEnterBalance}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

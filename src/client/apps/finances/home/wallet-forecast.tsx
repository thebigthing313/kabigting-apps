import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { TriangleAlertIcon } from "lucide-react"
import { AttentionBanner } from "@/apps/finances/attention/attention-banner"
import { dayAnchor } from "@/apps/finances/attention/attention-item"
import { useForecastWalletAttention } from "@/apps/finances/attention/use-attention"
import { ForecastChart } from "@/apps/finances/home/forecast-chart"
import { forecastItemKey, isOverdue } from "@/apps/finances/home/use-wallet-forecast"
import { useScrollToHash } from "@/hooks/use-scroll-to-hash"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import { lowBalanceWarnings } from "@shared/finances/attention"
import { type Forecast, type ForecastHorizon, FORECAST_HORIZONS } from "@shared/finances/forecast"
import { formatShown, toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

/** One forecast Wallet's Forecast: today's balance, the low point, the chart and the days. */
export function WalletForecast({
  wallet,
  days,
  onEnterBalance,
}: {
  wallet: Wallet
  days: ForecastHorizon
  /** Opens the Balance check dialog on this Wallet. */
  onEnterBalance: (walletId: string) => void
}) {
  const {
    items: attention,
    isLoading: attentionLoading,
    forecast: { result, isLoading: forecastLoading, today, labelOf },
  } = useForecastWalletAttention(wallet, days)
  // The banner sits on top, so everything waits for it rather than jumping down when it appears.
  const isLoading = forecastLoading || attentionLoading
  // A low-balance item opens this tab at its day.
  useScrollToHash(!isLoading)

  if (isLoading) return <Skeleton className="h-64" />
  const banner = (
    <AttentionBanner
      wallet={wallet}
      items={attention}
      days={days}
      onEnterBalance={onEnterBalance}
    />
  )
  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        {banner}
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
          <p className="text-muted-foreground">
            {wallet.name} has no Balance check yet, so it has no Forecast. Enter its balance as the
            bank shows it to start one.
          </p>
          <Button className="h-11" onClick={() => onEnterBalance(wallet.id)}>
            Enter balance
          </Button>
        </div>
      </div>
    )
  }

  const shown = (cents: number) => formatShown(wallet, cents)
  const { low } = result
  const threshold = wallet.lowBalanceThresholdCents
  const listed = result.days.filter((day, index) => index === 0 || day.items.length > 0)

  return (
    <div className="flex flex-col gap-4">
      {banner}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{wallet.name} today</p>
          <p
            data-testid="today-balance"
            className={cn(
              "text-4xl font-semibold break-words tabular-nums",
              result.todayBalanceCents < 0 && "text-destructive",
            )}
          >
            {shown(result.todayBalanceCents)}
          </p>
          <p className="text-sm text-muted-foreground">
            Lowest {shown(low.balanceCents)} on {formatDisplayDate(low.date)}
          </p>
        </div>
        <HorizonPicker days={days} />
      </div>

      <ForecastChart
        forecast={result}
        thresholdCents={threshold}
        formatAmount={shown}
        description={`End-of-day balance over the next ${days} days, lowest ${shown(low.balanceCents)} on ${formatDisplayDate(low.date)}`}
      />

      <ForecastWarnings wallet={wallet} forecast={result} />

      <ol aria-label="Day by day" className="flex flex-col">
        {listed.map((day) => (
          <li key={day.date} id={dayAnchor(day.date)} className="scroll-mt-20 border-b py-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">
                {day.date === today ? "Today" : formatDisplayDate(day.date)}
              </span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  day.balanceCents < 0 && "text-destructive",
                )}
              >
                {shown(day.balanceCents)}
              </span>
            </div>
            {day.items.length > 0 ? (
              <ul>
                {day.items.map((item) => (
                  <li
                    key={forecastItemKey(item)}
                    className="flex justify-between gap-3 pl-3 text-sm text-muted-foreground"
                  >
                    <span className="min-w-0 truncate">
                      {labelOf(item)}
                      {isOverdue(item) ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          {" "}
                          · Overdue since {formatDisplayDate(item.date)}
                        </span>
                      ) : null}
                    </span>
                    <ItemAmount wallet={wallet} cents={item.amountCents} />
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
      {listed.length === 1 && listed[0]!.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing is planned in the next {days} days.{" "}
          <Link to="/finances/schedules" className="underline">
            Add a Schedule
          </Link>
        </p>
      ) : null}
    </div>
  )
}

/**
 * The warnings for the first day under the Wallet's threshold and the first day under $0 (never on
 * a Wallet shown as owed). With `worstOnly`, just the worse of the two: under $0 wins.
 */
export function ForecastWarnings({
  wallet,
  forecast,
  worstOnly = false,
}: {
  wallet: Wallet
  forecast: Forecast
  worstOnly?: boolean
}) {
  const threshold = wallet.lowBalanceThresholdCents
  const warnings = lowBalanceWarnings(wallet, forecast)
  const { underZero } = warnings
  const underThreshold = worstOnly && underZero ? null : warnings.underThreshold
  if (!underZero && !underThreshold) return null
  return (
    <div role="status" className="flex flex-col gap-1">
      {underThreshold ? (
        <Warning tone="warn">
          Under the {formatShown(wallet, threshold)} threshold on{" "}
          {formatDisplayDate(underThreshold)}
        </Warning>
      ) : null}
      {underZero ? <Warning tone="bad">Below $0 on {formatDisplayDate(underZero)}</Warning> : null}
    </div>
  )
}

/** A Forecast item's Amount as this Wallet shows it, signed, with money in in green. */
export function ItemAmount({ wallet, cents }: { wallet: Wallet; cents: number }) {
  const amount = toShown(wallet, cents)
  return (
    <span
      className={cn(
        "shrink-0 tabular-nums",
        amount > 0 && "text-emerald-700 dark:text-emerald-400",
      )}
    >
      {format(amount, { sign: "always" })}
    </span>
  )
}

function Warning({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 rounded-lg p-2 text-sm",
        tone === "bad"
          ? "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100"
          : "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
      )}
    >
      <TriangleAlertIcon className="size-4 shrink-0" />
      {children}
    </p>
  )
}

/** 30, 90, 180 or 365 days, kept in `?days=`. */
function HorizonPicker({ days }: { days: ForecastHorizon }) {
  return (
    <nav aria-label="Horizon" className="inline-flex rounded-lg border p-0.5 text-sm">
      {FORECAST_HORIZONS.map((horizon) => (
        <Link
          key={horizon}
          to="/finances"
          search={(previous) => ({ ...previous, days: horizon })}
          aria-label={`${horizon} days`}
          aria-current={horizon === days ? "true" : undefined}
          className={cn(
            "flex h-9 min-w-11 items-center justify-center rounded-md px-2",
            horizon === days ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {horizon}d
        </Link>
      ))}
    </nav>
  )
}

import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { TriangleAlertIcon } from "lucide-react"
import { ForecastChart } from "@/apps/finances/home/forecast-chart"
import { scheduleLabel } from "@/apps/finances/schedules/schedule-display"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useLatestBalanceCheck } from "@/data/finances-balance-checks"
import { useSchedules } from "@/data/finances-schedules"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { formatDisplayDate, today as householdToday } from "@shared/dates"
import {
  type ForecastHorizon,
  type ForecastItem,
  FORECAST_HORIZONS,
  forecast,
} from "@shared/finances/forecast"
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
  const { check, isLoading } = useLatestBalanceCheck(wallet.id)
  const { data: schedules, isLoading: schedulesLoading } = useSchedules()
  const { data: wallets } = useWallets()
  const { data: accounts } = useFinancesAccounts()

  if (isLoading || schedulesLoading) return <Skeleton className="h-64" />
  const today = householdToday()
  const result = forecast({
    wallet,
    latestCheck: check ?? null,
    // Hand entry, uploads and one-off Planned items arrive in later slices; until then there
    // are none. Stored Occurrences (overrides and skips) arrive with their own slice too.
    actualsSince: [],
    planned: [],
    plannedTransfers: [],
    schedules,
    occurrences: [],
    today,
    horizonDays: days,
  })

  if (!result) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <p className="text-muted-foreground">
          {wallet.name} has no Balance check yet, so it has no Forecast. Enter its balance as the
          bank shows it to start one.
        </p>
        <Button className="h-11" onClick={() => onEnterBalance(wallet.id)}>
          Enter balance
        </Button>
      </div>
    )
  }

  const walletName = new Map(wallets.map((each) => [each.id, each.name]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]))
  const labelOf = (item: ForecastItem): string => {
    if (item.kind === "occurrence") {
      const schedule = scheduleById.get(item.scheduleId)
      return schedule ? scheduleLabel(schedule, walletName, accountName, wallet.id) : "Schedule"
    }
    return { actual: "Actual", planned: "Planned", plannedTransfer: "Planned Transfer" }[item.kind]
  }
  const shown = (cents: number) => formatShown(wallet, cents)
  const { low, firstUnderThreshold, firstUnderZero } = result
  const threshold = wallet.lowBalanceThresholdCents
  // A $0 threshold is the $0 warning already; it is not said twice.
  const underThreshold = threshold === 0 ? null : firstUnderThreshold
  const listed = result.days.filter((day, index) => index === 0 || day.items.length > 0)

  return (
    <div className="flex flex-col gap-4">
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
        description={`End-of-day balance over the next ${days} days, lowest ${shown(low.balanceCents)} on ${formatDisplayDate(low.date)}`}
      />

      {firstUnderZero || underThreshold ? (
        <div role="status" className="flex flex-col gap-1">
          {underThreshold ? (
            <Warning tone="warn">
              Under the {shown(threshold)} threshold on {formatDisplayDate(underThreshold)}
            </Warning>
          ) : null}
          {firstUnderZero ? (
            <Warning tone="bad">Below $0 on {formatDisplayDate(firstUnderZero)}</Warning>
          ) : null}
        </div>
      ) : null}

      <ol aria-label="Day by day" className="flex flex-col">
        {listed.map((day) => (
          <li key={day.date} className="border-b py-2">
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
                    key={keyOf(item)}
                    className="flex justify-between gap-3 pl-3 text-sm text-muted-foreground"
                  >
                    <span className="min-w-0 truncate">
                      {labelOf(item)}
                      {"overdue" in item && item.overdue ? (
                        <span className="text-amber-700 dark:text-amber-400">
                          {" "}
                          · Overdue since {formatDisplayDate(item.date)}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        toShown(wallet, item.amountCents) > 0 &&
                          "text-emerald-700 dark:text-emerald-400",
                      )}
                    >
                      {format(toShown(wallet, item.amountCents), { sign: "always" })}
                    </span>
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

function keyOf(item: ForecastItem): string {
  return item.kind === "occurrence"
    ? `occurrence:${item.scheduleId}:${item.nominalDate}`
    : `${item.kind}:${item.id}`
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

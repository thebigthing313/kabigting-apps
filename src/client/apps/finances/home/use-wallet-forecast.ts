import { scheduleLabel } from "@/apps/finances/schedules/schedule-display"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useLatestBalanceCheck } from "@/data/finances-balance-checks"
import { useStoredOccurrences } from "@/data/finances-occurrences"
import { useSchedules } from "@/data/finances-schedules"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { today as householdToday } from "@shared/dates"
import { type ForecastItem, forecast } from "@shared/finances/forecast"

/**
 * One forecast Wallet's Forecast over the next `days`, with what each item is called. `result` is
 * null while loading and when the Wallet has no Balance check yet.
 */
export function useWalletForecast(wallet: Wallet, days: number) {
  const { check, isLoading } = useLatestBalanceCheck(wallet.id)
  const { data: schedules, isLoading: schedulesLoading } = useSchedules()
  const { data: wallets } = useWallets()
  const { data: accounts } = useFinancesAccounts()
  const { data: occurrences, isLoading: occurrencesLoading } = useStoredOccurrences()

  const loading = isLoading || schedulesLoading || occurrencesLoading
  const today = householdToday()
  const result = loading
    ? null
    : forecast({
        wallet,
        latestCheck: check ?? null,
        // Hand entry, uploads and one-off Planned items arrive in later slices; until then there
        // are none.
        actualsSince: [],
        planned: [],
        plannedTransfers: [],
        schedules,
        occurrences,
        today,
        horizonDays: days,
      })

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

  return { result, isLoading: loading, today, labelOf }
}

/** A stable key for a Forecast item within one Wallet's Forecast. */
export function forecastItemKey(item: ForecastItem): string {
  return item.kind === "occurrence"
    ? `occurrence:${item.scheduleId}:${item.nominalDate}`
    : `${item.kind}:${item.id}`
}

/** Whether a Planned item is Overdue: its date passed and it is not yet Reconciled or skipped. */
export function isOverdue(item: ForecastItem): boolean {
  return "overdue" in item && item.overdue
}

import { scheduleLabel } from "@/apps/finances/schedules/schedule-display"
import { transactionLabel, transferLabel } from "@/apps/finances/transactions/transaction-display"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useLatestBalanceCheck } from "@/data/finances-balance-checks"
import { useStoredOccurrences } from "@/data/finances-occurrences"
import { useSchedules } from "@/data/finances-schedules"
import { useActualsSince, useOutstandingOneOffs } from "@/data/finances-transactions"
import { useOutstandingPlannedTransfers } from "@/data/finances-transfers"
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
  const {
    actuals,
    transactions,
    transfers,
    isLoading: actualsLoading,
  } = useActualsSince(wallet.id, check?.date)
  const { oneOffs, isLoading: oneOffsLoading } = useOutstandingOneOffs(wallet.id)
  const { plannedTransfers, isLoading: plannedTransfersLoading } = useOutstandingPlannedTransfers(
    wallet.id,
  )

  const loading =
    isLoading ||
    schedulesLoading ||
    occurrencesLoading ||
    actualsLoading ||
    oneOffsLoading ||
    plannedTransfersLoading
  const today = householdToday()
  const result = loading
    ? null
    : forecast({
        wallet,
        latestCheck: check ?? null,
        actualsSince: actuals,
        planned: oneOffs,
        plannedTransfers,
        schedules,
        occurrences,
        today,
        horizonDays: days,
      })

  const walletName = new Map(wallets.map((each) => [each.id, each.name]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const scheduleById = new Map(schedules.map((schedule) => [schedule.id, schedule]))
  const transactionById = new Map([...transactions, ...oneOffs].map((row) => [row.id, row]))
  const transferById = new Map([...transfers, ...plannedTransfers].map((row) => [row.id, row]))
  const labelOf = (item: LabelledItem): string => {
    if (item.kind === "occurrence") {
      const schedule = scheduleById.get(item.scheduleId)
      return schedule ? scheduleLabel(schedule, walletName, accountName, wallet.id) : "Schedule"
    }
    const transfer = transferById.get(item.id)
    if (transfer) return transferLabel(transfer, wallet.id, walletName)
    const row = transactionById.get(item.id)
    if (row) return transactionLabel(row, accountName)
    return { actual: "Actual", planned: "Planned", plannedTransfer: "Planned Transfer" }[item.kind]
  }

  return { result, isLoading: loading, today, labelOf }
}

/** What names a Forecast item: its Schedule, or its own row. Every ForecastItem is one. */
export type LabelledItem =
  | { kind: "occurrence"; scheduleId: string }
  | { kind: "actual" | "planned" | "plannedTransfer"; id: string }

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

import { type LabelledItem, useWalletForecast } from "@/apps/finances/home/use-wallet-forecast"
import { transactionLabel } from "@/apps/finances/transactions/transaction-display"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useHouseholdToReview } from "@/data/finances-transactions"
import type { Wallet } from "@/data/finances-wallets"
import { type AttentionItem, walletAttention } from "@shared/finances/attention"
import type { Forecast } from "@shared/finances/forecast"

/** An attention item with what it is called: a line's or a Planned item's label. */
export type NamedItem = { item: AttentionItem; label: string }

/** A stable key for an attention item within one Wallet's. */
export function attentionKey(item: AttentionItem): string {
  if (item.kind === "toReview" || item.kind === "overdueOneOff") return `${item.kind}:${item.id}`
  if (item.kind === "overdueOccurrence") {
    return `${item.kind}:${item.scheduleId}:${item.nominalDate}`
  }
  if (item.kind === "lowBalance") return `${item.kind}:${item.under}`
  return item.kind
}

/**
 * One Wallet's attention items, named. A forecast Wallet's come with its Forecast over `days`,
 * which its home tab also shows.
 */
function useNamedAttention(
  wallet: Wallet,
  forecast: {
    result: Forecast | null
    isLoading: boolean
    labelOf: (item: LabelledItem) => string
  },
) {
  // Every Wallet's lines in one request, shared by each Wallet's group; this Wallet's kept here.
  const { lines: household, isLoading } = useHouseholdToReview()
  const lines = household.filter((line) => line.walletId === wallet.id)
  const { data: accounts } = useFinancesAccounts()
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const lineById = new Map(lines.map((line) => [line.id, line]))
  const loading = isLoading || forecast.isLoading

  const items = loading
    ? []
    : walletAttention({
        wallet,
        hasBalanceCheck: forecast.result !== null,
        toReview: lines,
        forecast: forecast.result,
      })
  const labelOf = (item: AttentionItem): string => {
    switch (item.kind) {
      case "toReview": {
        const line = lineById.get(item.id)
        return line ? transactionLabel(line, accountName) : "Uploaded line"
      }
      case "overdueOccurrence":
        return forecast.labelOf({ kind: "occurrence", scheduleId: item.scheduleId })
      case "overdueOneOff":
        return forecast.labelOf({
          kind: item.transfer ? "plannedTransfer" : "planned",
          id: item.id,
        })
      default:
        return wallet.name
    }
  }
  const named: NamedItem[] = items.map((item) => ({ item, label: labelOf(item) }))
  return { items: named, isLoading: loading }
}

/** A forecast Wallet's attention items, with its Forecast over `days`. */
export function useForecastWalletAttention(wallet: Wallet, days: number) {
  const forecast = useWalletForecast(wallet, days)
  return { ...useNamedAttention(wallet, forecast), forecast }
}

const NO_FORECAST = { result: null, isLoading: false, labelOf: () => "" }

/** A Wallet outside the forecast has only its lines To review. */
export function useOutsideWalletAttention(wallet: Wallet) {
  return useNamedAttention(wallet, NO_FORECAST)
}

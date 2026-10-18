/**
 * Attention: what in one Wallet waits for a person. Home's banner shows a Wallet's To review and
 * Overdue items; the bell lists every Wallet's items. Each item links to where it is fixed.
 */
import type { Forecast } from "./forecast.ts"

export type AttentionItem =
  /** An uploaded line waiting in To review. */
  | { kind: "toReview"; walletId: string; id: string; date: string; amountCents: number }
  | {
      kind: "overdueOccurrence"
      walletId: string
      scheduleId: string
      nominalDate: string
      date: string
      /** Signed as it moves this Wallet. */
      amountCents: number
    }
  | {
      /** A one-off Planned Transaction, or a one-off Planned Transfer when `transfer`. */
      kind: "overdueOneOff"
      walletId: string
      id: string
      transfer: boolean
      date: string
      /** Signed as it moves this Wallet. */
      amountCents: number
    }
  /** A forecast Wallet with no Balance check, so no Forecast. */
  | { kind: "noBalanceCheck"; walletId: string }
  | {
      /** The first day in the horizon under the Wallet's threshold, or under $0. */
      kind: "lowBalance"
      walletId: string
      under: "threshold" | "zero"
      thresholdCents: number
      date: string
    }

export type AttentionInput = {
  wallet: { id: string; inForecast: boolean; lowBalanceThresholdCents: number }
  hasBalanceCheck: boolean
  /** The Wallet's uploaded lines no one has reviewed yet. */
  toReview: readonly { id: string; date: string; amountCents: number }[]
  /** The Wallet's Forecast over the current horizon; null without one. */
  forecast: Forecast | null
}

/**
 * The days a Forecast first goes under the Wallet's threshold and under $0. A $0 threshold is the
 * $0 warning already, so it is not given twice.
 */
export function lowBalanceWarnings(
  thresholdCents: number,
  forecast: Forecast,
): { underThreshold: string | null; underZero: string | null } {
  return {
    underThreshold: thresholdCents === 0 ? null : forecast.firstUnderThreshold,
    underZero: forecast.firstUnderZero,
  }
}

/**
 * One Wallet's attention items: its lines To review, then its Overdue items by date (the
 * Forecast's, so only those after the latest Balance check), then a missing Balance check or the
 * low-balance warnings. Only a forecast Wallet has the last three.
 */
export function walletAttention({
  wallet,
  hasBalanceCheck,
  toReview,
  forecast,
}: AttentionInput): AttentionItem[] {
  const walletId = wallet.id
  const items: AttentionItem[] = toReview.map(({ id, date, amountCents }) => ({
    kind: "toReview",
    walletId,
    id,
    date,
    amountCents,
  }))
  if (!wallet.inForecast) return items
  if (!hasBalanceCheck || forecast === null) {
    if (!hasBalanceCheck) items.push({ kind: "noBalanceCheck", walletId })
    return items
  }

  // Overdue items all sit under today.
  const overdue = (forecast.days[0]?.items ?? []).flatMap((item): AttentionItem[] => {
    if (item.kind === "actual" || !item.overdue) return []
    const { date, amountCents } = item
    return item.kind === "occurrence"
      ? [
          {
            kind: "overdueOccurrence",
            walletId,
            scheduleId: item.scheduleId,
            nominalDate: item.nominalDate,
            date,
            amountCents,
          },
        ]
      : [
          {
            kind: "overdueOneOff",
            walletId,
            id: item.id,
            transfer: item.kind === "plannedTransfer",
            date,
            amountCents,
          },
        ]
  })
  items.push(...overdue.toSorted((a, b) => dateOf(a).localeCompare(dateOf(b))))

  const thresholdCents = wallet.lowBalanceThresholdCents
  const { underThreshold, underZero } = lowBalanceWarnings(thresholdCents, forecast)
  if (underThreshold !== null) {
    items.push({
      kind: "lowBalance",
      walletId,
      under: "threshold",
      thresholdCents,
      date: underThreshold,
    })
  }
  if (underZero !== null) {
    items.push({ kind: "lowBalance", walletId, under: "zero", thresholdCents, date: underZero })
  }
  return items
}

function dateOf(item: AttentionItem): string {
  return "date" in item ? item.date : ""
}

/** How many of a Wallet's items are To review and how many Overdue, for its banner and card. */
export function attentionCounts(items: readonly AttentionItem[]): {
  toReview: number
  overdue: number
} {
  return {
    toReview: items.filter((item) => item.kind === "toReview").length,
    overdue: items.filter(
      (item) => item.kind === "overdueOccurrence" || item.kind === "overdueOneOff",
    ).length,
  }
}

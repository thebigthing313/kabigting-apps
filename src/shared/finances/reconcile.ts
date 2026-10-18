/**
 * Reconcile: pairing an Actual with the Planned item it fulfils. The app suggests candidates and
 * a person confirms one; the Actual's amount and date are the truth.
 */
import { addDays, daysBetween, today as householdToday } from "../dates.ts"
import { expandSchedule, type ScheduleTerms, type StoredOccurrence } from "./occurrences.ts"
import type { TransactionRow, TransferRow } from "./schemas.ts"
import {
  enteredByHand,
  onlySideArrived,
  otherSide,
  sideOf,
  transferAmountOn,
  walletOnSide,
} from "./transfers.ts"

/** How many days either side of an Actual a suggested Planned item may be dated. */
export const MATCH_WINDOW_DAYS = 7

/** The two Wallets a Planned Transfer moves money between, the way it moves it. */
export type TransferWallets = { fromWalletId: string; toWalletId: string }

type PlannedDetails = {
  /** The Wallet it is seen from. */
  walletId: string
  /** Where it lands: an Occurrence's override, else its nominal date. */
  date: string
  /** Signed, as it moves the Wallet it is seen from. */
  amountCents: number
  accountId: string | null
  categoryId: string | null
  /** Set on a Planned Transfer; null on a Planned Transaction. */
  between: TransferWallets | null
}

/**
 * An outstanding Planned item an Actual can be Reconciled to: an Occurrence of any Schedule, a
 * one-off Planned Transaction, or a one-off Planned Transfer.
 */
export type PlannedItem =
  | ({ kind: "occurrence"; scheduleId: string; nominalDate: string } & PlannedDetails)
  | ({ kind: "transaction" | "transfer"; id: string } & PlannedDetails)

/** One string naming a Planned item, unique among a Wallet's outstanding ones. */
export function plannedKey(item: PlannedItem): string {
  return item.kind === "occurrence" ? `occurrence:${item.scheduleId}:${item.nominalDate}` : item.id
}

/**
 * The outstanding Planned items to suggest for `actual`, best first: those in the same Wallet,
 * with the same sign, dated within 7 days either side. They rank by closeness of amount, then of
 * date.
 */
export function suggestMatches<Item extends PlannedDetails>(
  actual: { walletId: string; date: string; amountCents: number },
  outstanding: readonly Item[],
): Item[] {
  const daysOff = (item: Item) => Math.abs(daysBetween(actual.date, item.date))
  const amountOff = (item: Item) => Math.abs(item.amountCents - actual.amountCents)
  return outstanding
    .filter(
      (item) =>
        item.walletId === actual.walletId &&
        Math.sign(item.amountCents) === Math.sign(actual.amountCents) &&
        daysOff(item) <= MATCH_WINDOW_DAYS,
    )
    .toSorted((a, b) => amountOff(a) - amountOff(b) || daysOff(a) - daysOff(b))
}

/**
 * The dates from `days` before the earliest of `rows` to `days` after the latest, inclusive: where
 * their suggestions can be dated. Null when there are no rows.
 */
export function datesAround(
  rows: readonly { date: string }[],
  days: number,
): { from: string; to: string } | null {
  const dates = rows.map((row) => row.date).toSorted()
  const first = dates[0]
  const last = dates.at(-1)
  if (first === undefined || last === undefined) return null
  return { from: addDays(first, -days), to: addDays(last, days) }
}

/** How many days either side of an uploaded line a hand-entered twin may be dated. */
export const TWIN_WINDOW_DAYS = 3

/**
 * What `findHandEntryTwin` reads of an Actual a person may have entered by hand. Only a
 * hand-entered row (source `manual`) has no key from a bank or the old ledger.
 */
export type MaybeHandEntry = Pick<
  TransactionRow,
  "walletId" | "date" | "amountCents" | "status" | "source" | "ignored"
>

/**
 * The hand-entered Actual an uploaded line most likely repeats: one in the same Wallet, for the
 * exact amount, dated within 3 days either side, with no key of its own. The closest date wins.
 */
export function findHandEntryTwin<Row extends MaybeHandEntry>(
  line: { walletId: string; date: string; amountCents: number },
  handEntered: readonly Row[],
): Row | undefined {
  const daysOff = (row: Row) => Math.abs(daysBetween(line.date, row.date))
  return handEntered
    .filter(
      (row) =>
        row.status === "actual" &&
        row.source === "manual" &&
        !row.ignored &&
        row.walletId === line.walletId &&
        row.amountCents === line.amountCents &&
        daysOff(row) <= TWIN_WINDOW_DAYS,
    )
    .toSorted((a, b) => daysOff(a) - daysOff(b))[0]
}

/** What `suggestTransferHalf` reads of an Actual Transfer with a side a line may fill. */
export type MaybeWaitingTransfer = Pick<
  TransferRow,
  | "status"
  | "ignored"
  | "date"
  | "amountCents"
  | "fromWalletId"
  | "toWalletId"
  | "fromSource"
  | "toSource"
>

/**
 * The Actual Transfer an uploaded line is most likely one side of, moving the line's Wallet by
 * its exact amount the Transfer's way. Either the Transfer's line arrived from the other Wallet
 * while this Wallet's side is still missing, dated within 7 days either side; or it was entered by
 * hand with neither side keyed, dated within 3 days either side, as for a hand-entry twin. The
 * closest date wins.
 */
export function suggestTransferHalf<Row extends MaybeWaitingTransfer>(
  line: { walletId: string; date: string; amountCents: number },
  transfers: readonly Row[],
): Row | undefined {
  const daysOff = (row: Row) => Math.abs(daysBetween(line.date, row.date))
  const openHere = (row: Row) => {
    const arrived = onlySideArrived(row)
    if (arrived !== null) {
      return (
        walletOnSide(row, otherSide(arrived)) === line.walletId && daysOff(row) <= MATCH_WINDOW_DAYS
      )
    }
    return (
      enteredByHand(row) && sideOf(row, line.walletId) !== null && daysOff(row) <= TWIN_WINDOW_DAYS
    )
  }
  return transfers
    .filter((row) => openHere(row) && transferAmountOn(row, line.walletId) === line.amountCents)
    .toSorted((a, b) => daysOff(a) - daysOff(b))[0]
}

/**
 * What To review offers for an uploaded line: the same as a hand entry, one side of an Actual
 * Transfer (its other side, or the same as a hand-entered one), or a Planned item.
 */
export type ReviewSuggestion<Item, Row, Transfer> =
  | { kind: "twin"; handEntry: Row }
  | { kind: "transfer"; transfer: Transfer }
  | { kind: "planned"; item: Item }

/**
 * What To review offers for an uploaded line, or null when it is simply unplanned. A hand-entry
 * twin comes first: the line is then most likely the Actual a person already entered, which may
 * itself be Reconciled. Then the Actual Transfer it is one side of, which is already recorded
 * and only waits for this line. Otherwise the best suggested Planned match.
 */
export function reviewSuggestion<
  Item extends PlannedDetails,
  Row extends MaybeHandEntry,
  Transfer extends MaybeWaitingTransfer,
>(
  line: { walletId: string; date: string; amountCents: number },
  candidates: {
    outstanding: readonly Item[]
    handEntered: readonly Row[]
    transfers: readonly Transfer[]
  },
): ReviewSuggestion<Item, Row, Transfer> | null {
  const handEntry = findHandEntryTwin(line, candidates.handEntered)
  if (handEntry) return { kind: "twin", handEntry }
  const transfer = suggestTransferHalf(line, candidates.transfers)
  if (transfer) return { kind: "transfer", transfer }
  const [item] = suggestMatches(line, candidates.outstanding)
  return item ? { kind: "planned", item } : null
}

/**
 * The items an Actual of this kind can be Reconciled to. An Actual Transaction takes any Planned
 * Transaction in its Wallet, or a Planned Transfer into or out of it, which it then becomes; an
 * Actual Transfer takes only a Planned Transfer between the same Wallets, the same way.
 */
export function reconcilableTo<Item extends PlannedDetails>(
  actual: { between: TransferWallets | null },
  items: readonly Item[],
): Item[] {
  const wallets = actual.between
  if (wallets === null) return [...items]
  return items.filter(
    (item) =>
      item.between?.fromWalletId === wallets.fromWalletId &&
      item.between.toWalletId === wallets.toWalletId,
  )
}

type Planned<Row> = Row & {
  id: string
  date: string
  amountCents: number
  accountId: string | null
  reconciledActualId: string | null
}

export type OutstandingInput = {
  walletId: string
  schedules: readonly (ScheduleTerms & {
    id: string
    walletId: string
    toWalletId: string | null
    accountId: string | null
    categoryId: string | null
  })[]
  /** Stored Occurrences of any Schedule. */
  occurrences: readonly (StoredOccurrence & { scheduleId: string })[]
  /** One-off Planned Transactions, on any Wallet. */
  planned: readonly Planned<{ walletId: string; categoryId: string | null }>[]
  /** One-off Planned Transfers, between any Wallets; amounts are positive. */
  plannedTransfers?: readonly Planned<TransferWallets>[]
  /** Inclusive dates the items land on. */
  range: { from: string; to: string }
  today?: string
}

/**
 * A Wallet's outstanding Planned items dated in the range, by date: its Schedules' upcoming and
 * Overdue Occurrences (Transfer Schedules into or out of it included), and its one-off Planned
 * Transactions and Transfers not yet Reconciled. Amounts are signed as they move this Wallet.
 */
export function outstandingPlanned(input: OutstandingInput): PlannedItem[] {
  const { walletId, range } = input
  const now = input.today ?? householdToday()
  const inRange = (date: string) => date >= range.from && date <= range.to
  const items: PlannedItem[] = []
  for (const schedule of input.schedules) {
    const between =
      schedule.toWalletId === null
        ? null
        : { fromWalletId: schedule.walletId, toWalletId: schedule.toWalletId }
    const sign = between
      ? Math.sign(transferAmountOn({ ...between, amountCents: 1 }, walletId))
      : schedule.walletId === walletId
        ? 1
        : 0
    if (sign === 0) continue
    const stored = input.occurrences.filter((row) => row.scheduleId === schedule.id)
    for (const occurrence of expandSchedule(schedule, stored, range, now)) {
      if (occurrence.state !== "upcoming" && occurrence.state !== "overdue") continue
      items.push({
        kind: "occurrence",
        scheduleId: schedule.id,
        nominalDate: occurrence.nominalDate,
        walletId,
        date: occurrence.date,
        amountCents: sign * occurrence.amountCents,
        accountId: schedule.accountId,
        categoryId: schedule.categoryId,
        between,
      })
    }
  }
  for (const row of input.planned) {
    if (row.walletId !== walletId || row.reconciledActualId !== null || !inRange(row.date)) continue
    const { id, date, amountCents, accountId, categoryId } = row
    const fields = { id, walletId, date, amountCents, accountId, categoryId, between: null }
    items.push({ kind: "transaction", ...fields })
  }
  for (const row of input.plannedTransfers ?? []) {
    const amountCents = transferAmountOn(row, walletId)
    if (amountCents === 0 || row.reconciledActualId !== null || !inRange(row.date)) continue
    const between = { fromWalletId: row.fromWalletId, toWalletId: row.toWalletId }
    const { id, date, accountId } = row
    items.push({
      kind: "transfer",
      id,
      walletId,
      date,
      amountCents,
      accountId,
      categoryId: null,
      between,
    })
  }
  return items.toSorted((a, b) => a.date.localeCompare(b.date))
}

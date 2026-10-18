import { Link } from "@tanstack/react-router"
import { ChevronLeftIcon } from "lucide-react"
import { useEffect, useState } from "react"
import { FinancesHeader } from "@/apps/finances/finances-header"
import { OccurrenceEditor } from "@/apps/finances/schedules/occurrence-editor"
import { ScheduleActions } from "@/apps/finances/schedules/schedule-actions"
import { scheduleLabel, shownOnWallet } from "@/apps/finances/schedules/schedule-display"
import { Skeleton } from "@/components/ui/skeleton"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useCategories } from "@/data/finances-categories"
import { saveOccurrence, useStoredOccurrences } from "@/data/finances-occurrences"
import { useSchedules, type Schedule } from "@/data/finances-schedules"
import { useTransactionsById } from "@/data/finances-transactions"
import { useTransfersById } from "@/data/finances-transfers"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { addMonthsClamped, formatDisplayDate, today } from "@shared/dates"
import {
  describeTerms,
  isReconciled,
  occurrencesAround,
  scheduleChain,
  type Occurrence,
} from "@shared/finances/occurrences"
import type { OccurrenceRow } from "@shared/finances/schemas"
import { format } from "@shared/money"
import { cn } from "cn"

/** How far back and ahead the Schedule page lists Occurrences, in months. */
const MONTHS_BACK = 3
const MONTHS_AHEAD = 6

/** The amount and date of the Actual an Occurrence is Reconciled to; a Transfer's is positive. */
type ReconciledActual = { amountCents: number; date: string }

/** An Occurrence on the page, with the Schedule in the chain it falls on. */
type ChainOccurrence = { schedule: Schedule; occurrence: Occurrence }

function occurrenceKey(scheduleId: string, nominalDate: string) {
  return `${scheduleId}:${nominalDate}`
}

/** The element id of an Occurrence's row, by its key. */
function occurrenceAnchor(key: string) {
  return `occurrence-${key}`
}

/**
 * One Schedule: who and what, its terms, its recent and upcoming Occurrences to edit, and its
 * History. A chain of Schedules changed from a date reads as one, under its newest.
 */
export function SchedulePage({
  scheduleId,
  occurrence,
}: {
  scheduleId: string
  /** The nominal date of one of this Schedule's Occurrences to open its editor, as from the bell. */
  occurrence?: string | undefined
}) {
  const { data: schedules, isLoading } = useSchedules()
  const { data: wallets, isLoading: walletsLoading } = useWallets()

  const chain = scheduleChain(schedules, scheduleId)
  const schedule = chain[0]
  const wallet = wallets.find((candidate) => candidate.id === schedule?.walletId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        to="/finances/schedules"
        className="-ml-2 flex h-10 items-center gap-1 self-start px-2 text-sm text-muted-foreground"
      >
        <ChevronLeftIcon className="size-4" />
        Schedules
      </Link>

      {isLoading || walletsLoading ? (
        <Skeleton className="h-20" />
      ) : schedule && wallet ? (
        <ScheduleDetail
          chain={chain}
          schedule={schedule}
          wallet={wallet}
          wallets={wallets}
          opening={occurrence}
        />
      ) : (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          There is no such Schedule.
        </p>
      )}
    </div>
  )
}

function ScheduleDetail({
  chain,
  schedule,
  wallet,
  wallets,
  opening,
}: {
  /** Newest first; `schedule` is the newest. */
  chain: readonly Schedule[]
  schedule: Schedule
  wallet: Wallet
  wallets: readonly Wallet[]
  /** The nominal date of `schedule`'s Occurrence whose editor opens with the page. */
  opening: string | undefined
}) {
  const { data: accounts } = useFinancesAccounts()
  const { data: categories } = useCategories()
  const { data: allStored } = useStoredOccurrences()

  const walletName = new Map(wallets.map((candidate) => [candidate.id, candidate.name]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const toWallet = wallets.find((candidate) => candidate.id === schedule.toWalletId)
  const category = categories.find((candidate) => candidate.id === schedule.categoryId)
  const chainIds = chain.map((member) => member.id)
  const stored = allStored.filter((row) => chainIds.includes(row.scheduleId))
  const storedOf = (member: Schedule) => stored.filter((row) => row.scheduleId === member.id)
  const reconciled = stored.some(isReconciled)
  // The Actuals are the truth for what was Reconciled: their amounts and dates are shown.
  const transactions = useTransactionsById(
    stored.flatMap((row) =>
      row.reconciledTransactionId === null ? [] : [row.reconciledTransactionId],
    ),
  )
  const transfers = useTransfersById(
    stored.flatMap((row) => (row.reconciledTransferId === null ? [] : [row.reconciledTransferId])),
  )
  const actuals = new Map<string, ReconciledActual>([...transactions, ...transfers])

  const now = today()
  const monthsBack = addMonthsClamped(now, -MONTHS_BACK)
  const range = {
    // An Overdue Occurrence opened from the bell is listed even when older than that.
    from: opening !== undefined && opening < monthsBack ? opening : monthsBack,
    to: addMonthsClamped(now, MONTHS_AHEAD),
  }
  // Each Schedule in the chain contributes the Occurrences on its own terms.
  const occurrences: ChainOccurrence[] = chain
    .flatMap((member) =>
      occurrencesAround(member, storedOf(member), range, now).map((occurrence) => ({
        schedule: member,
        occurrence,
      })),
    )
    .toSorted(
      (a, b) =>
        a.occurrence.date.localeCompare(b.occurrence.date) ||
        a.occurrence.nominalDate.localeCompare(b.occurrence.nominalDate),
    )

  return (
    <>
      <div className="flex flex-col gap-1">
        <FinancesHeader title={scheduleLabel(schedule, walletName, accountName)} />
        <p className="text-sm text-muted-foreground">
          {toWallet ? `${wallet.name} → ${toWallet.name}` : wallet.name}
          {toWallet ? null : ` · ${category?.name ?? "Uncategorised"}`}
        </p>
        <p className="text-sm">
          {describeTerms(schedule)} ·{" "}
          {format(shownOnWallet(schedule, wallet, schedule.amountCents), { sign: "always" })}
          {schedule.endDate === null ? null : ` · ends ${formatDisplayDate(schedule.endDate)}`}
        </p>
        {schedule.note && schedule.accountId !== null ? (
          <p className="text-sm break-words text-muted-foreground">{schedule.note}</p>
        ) : null}
      </div>

      <ScheduleActions
        schedule={schedule}
        chainIds={chainIds}
        stored={storedOf(schedule)}
        wallet={wallet}
        deletable={!reconciled}
      />

      <section aria-labelledby="occurrences-heading" className="flex flex-col gap-2">
        <h2 id="occurrences-heading" className="font-medium">
          Occurrences
        </h2>
        <p className="text-sm text-muted-foreground">
          The last {MONTHS_BACK} months and the next {MONTHS_AHEAD}. Tap one to change its amount or
          date, or to skip it.
        </p>
        {occurrences.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-muted-foreground">
            No Occurrences in these months.
          </p>
        ) : (
          <OccurrenceList
            // Another Occurrence to open starts the list afresh, with its editor open.
            key={opening}
            opening={opening === undefined ? null : occurrenceKey(schedule.id, opening)}
            wallet={wallet}
            toWallet={toWallet}
            occurrences={occurrences}
            stored={stored}
            actuals={actuals}
          />
        )}
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-2">
        <h2 id="history-heading" className="font-medium">
          History
        </h2>
        <ol className="divide-y rounded-xl border">
          {chain.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">
                  {formatDisplayDate(member.startDate)} –{" "}
                  {member.endDate === null ? "no end date" : formatDisplayDate(member.endDate)}
                </span>
                <span className="text-sm text-muted-foreground">{describeTerms(member)}</span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {format(shownOnWallet(member, wallet, member.amountCents), { sign: "always" })}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function OccurrenceList({
  opening,
  wallet,
  toWallet,
  occurrences,
  stored,
  actuals,
}: {
  /** The key of the Occurrence whose editor is open at first. */
  opening: string | null
  wallet: Wallet
  toWallet: Wallet | undefined
  occurrences: readonly ChainOccurrence[]
  stored: readonly OccurrenceRow[]
  /** The Actuals Occurrences are Reconciled to, by id, as they load. */
  actuals: ReadonlyMap<string, ReconciledActual>
}) {
  // The key of the Occurrence whose editor is open.
  const [editing, setEditing] = useState<string | null>(opening)
  // The Occurrence opened with the page is brought into view.
  useEffect(() => {
    if (opening !== null) {
      document.getElementById(occurrenceAnchor(opening))?.scrollIntoView({ block: "center" })
    }
  }, [opening])
  const storedByKey = new Map(
    stored.map((row) => [occurrenceKey(row.scheduleId, row.nominalDate), row]),
  )

  return (
    <ul className="divide-y rounded-xl border">
      {occurrences.map(({ schedule, occurrence }) => {
        const key = occurrenceKey(schedule.id, occurrence.nominalDate)
        const row = storedByKey.get(key)
        const overridden =
          row !== undefined && (row.overrideAmountCents !== null || row.overrideDate !== null)
        const open = editing === key
        const actualId = row?.reconciledTransactionId ?? row?.reconciledTransferId
        const actual = actualId == null ? undefined : actuals.get(actualId)
        const summary = (
          <OccurrenceSummary
            occurrence={occurrence}
            overridden={overridden}
            amount={shownOnWallet(schedule, wallet, actual?.amountCents ?? occurrence.amountCents)}
            actualDate={actual?.date}
          />
        )
        return (
          <li key={key} id={occurrenceAnchor(key)} aria-label={formatDisplayDate(occurrence.date)}>
            {occurrence.state === "reconciled" ? (
              // A Reconciled Occurrence is the Actual's now; it is changed from the Wallet.
              <Link
                to="/finances/wallets/$walletId"
                params={{ walletId: schedule.walletId }}
                search={{ tab: "activity" }}
                className="block px-3 py-2 hover:bg-muted/50"
              >
                {summary}
              </Link>
            ) : (
              <button
                type="button"
                className={cn("block w-full px-3 py-2 text-left hover:bg-muted/50", {
                  "bg-muted/50": open,
                })}
                aria-expanded={open}
                onClick={() => setEditing(open ? null : key)}
              >
                {summary}
              </button>
            )}
            {open ? (
              <div className="border-t px-3 py-3">
                <OccurrenceEditor
                  schedule={schedule}
                  occurrence={occurrence}
                  wallet={wallet}
                  toWallet={toWallet}
                  overridden={overridden}
                  onCancel={() => setEditing(null)}
                  onSave={async (override) => {
                    const saved = await saveOccurrence(
                      {
                        scheduleId: schedule.id,
                        nominalDate: occurrence.nominalDate,
                        stored: row,
                      },
                      override,
                    )
                    // Stays open if the server refuses it, keeping what was typed.
                    if (saved) setEditing(null)
                  }}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

const BADGES = {
  overridden: "Overridden",
  skipped: "Skipped",
  overdue: "Overdue",
  reconciled: "Reconciled",
} as const

function Badge({ kind }: { kind: keyof typeof BADGES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        kind === "overdue" && "border-destructive/40 text-destructive",
      )}
    >
      {BADGES[kind]}
    </span>
  )
}

/** The date, the amount and the state badges; none for an untouched upcoming Occurrence. */
function OccurrenceSummary({
  occurrence,
  overridden,
  amount,
  actualDate,
}: {
  occurrence: Occurrence
  overridden: boolean
  amount: number
  /** The date of the Actual it is Reconciled to, once loaded. */
  actualDate?: string | undefined
}) {
  const moved = occurrence.date !== occurrence.nominalDate
  const skipped = occurrence.state === "skipped"
  return (
    <span className="flex min-h-10 items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("font-medium", skipped && "text-muted-foreground line-through")}>
          {formatDisplayDate(occurrence.date)}
        </span>
        {moved ? (
          <span className="text-xs text-muted-foreground">
            Moved from {formatDisplayDate(occurrence.nominalDate)}
          </span>
        ) : null}
        {actualDate !== undefined && actualDate !== occurrence.date ? (
          <span className="text-xs text-muted-foreground">
            Actual on {formatDisplayDate(actualDate)}
          </span>
        ) : null}
        <span className="mt-1 flex flex-wrap gap-1 empty:hidden">
          {overridden ? <Badge kind="overridden" /> : null}
          {occurrence.state === "upcoming" ? null : <Badge kind={occurrence.state} />}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-medium tabular-nums",
          skipped && "text-muted-foreground line-through",
        )}
      >
        {format(amount, { sign: "always" })}
      </span>
    </span>
  )
}

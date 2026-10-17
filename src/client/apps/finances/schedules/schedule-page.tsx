import { Link } from "@tanstack/react-router"
import { ChevronLeftIcon } from "lucide-react"
import { useState } from "react"
import { OccurrenceEditor } from "@/apps/finances/schedules/occurrence-editor"
import { scheduleLabel, shownOnWallet } from "@/apps/finances/schedules/schedule-display"
import { Skeleton } from "@/components/ui/skeleton"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useCategories } from "@/data/finances-categories"
import { saveOccurrence, useStoredOccurrences } from "@/data/finances-occurrences"
import { useSchedule, type Schedule } from "@/data/finances-schedules"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { addMonthsClamped, formatDisplayDate, today } from "@shared/dates"
import { describeTerms, occurrencesAround, type Occurrence } from "@shared/finances/occurrences"
import type { OccurrenceRow } from "@shared/finances/schemas"
import { format } from "@shared/money"
import { cn } from "cn"

/** How far back and ahead the Schedule page lists Occurrences, in months. */
const MONTHS_BACK = 3
const MONTHS_AHEAD = 6

/** One Schedule: who and what, its terms, and its recent and upcoming Occurrences to edit. */
export function SchedulePage({ scheduleId }: { scheduleId: string }) {
  const { schedule, isLoading } = useSchedule(scheduleId)
  const { data: wallets, isLoading: walletsLoading } = useWallets()

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
        <ScheduleDetail schedule={schedule} wallet={wallet} wallets={wallets} />
      ) : (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          There is no such Schedule.
        </p>
      )}
    </div>
  )
}

function ScheduleDetail({
  schedule,
  wallet,
  wallets,
}: {
  schedule: Schedule
  wallet: Wallet
  wallets: readonly Wallet[]
}) {
  const { data: accounts } = useFinancesAccounts()
  const { data: categories } = useCategories()
  const { data: allStored } = useStoredOccurrences()

  const walletName = new Map(wallets.map((candidate) => [candidate.id, candidate.name]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const toWallet = wallets.find((candidate) => candidate.id === schedule.toWalletId)
  const category = categories.find((candidate) => candidate.id === schedule.categoryId)
  const stored = allStored.filter((row) => row.scheduleId === schedule.id)

  const now = today()
  const occurrences = occurrencesAround(
    schedule,
    stored,
    { from: addMonthsClamped(now, -MONTHS_BACK), to: addMonthsClamped(now, MONTHS_AHEAD) },
    now,
  )

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold break-words">
          {scheduleLabel(schedule, walletName, accountName)}
        </h1>
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
            schedule={schedule}
            wallet={wallet}
            toWallet={toWallet}
            occurrences={occurrences}
            stored={stored}
          />
        )}
      </section>
    </>
  )
}

function OccurrenceList({
  schedule,
  wallet,
  toWallet,
  occurrences,
  stored,
}: {
  schedule: Schedule
  wallet: Wallet
  toWallet: Wallet | undefined
  occurrences: readonly Occurrence[]
  stored: readonly OccurrenceRow[]
}) {
  // The nominal date of the Occurrence whose editor is open.
  const [editing, setEditing] = useState<string | null>(null)
  const storedByNominal = new Map(stored.map((row) => [row.nominalDate, row]))

  return (
    <ul className="divide-y rounded-xl border">
      {occurrences.map((occurrence) => {
        const row = storedByNominal.get(occurrence.nominalDate)
        const overridden =
          row !== undefined && (row.overrideAmountCents !== null || row.overrideDate !== null)
        const open = editing === occurrence.nominalDate
        const summary = (
          <OccurrenceSummary
            occurrence={occurrence}
            overridden={overridden}
            amount={shownOnWallet(schedule, wallet, occurrence.amountCents)}
          />
        )
        return (
          <li key={occurrence.nominalDate} aria-label={formatDisplayDate(occurrence.date)}>
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
                onClick={() => setEditing(open ? null : occurrence.nominalDate)}
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
}: {
  occurrence: Occurrence
  overridden: boolean
  amount: number
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

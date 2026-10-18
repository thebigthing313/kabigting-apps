import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { scheduleLabel, shownOnWallet } from "@/apps/finances/schedules/schedule-display"
import { ScheduleForm } from "@/apps/finances/schedules/schedule-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useStoredOccurrences } from "@/data/finances-occurrences"
import { addSchedule, useSchedules, type Schedule } from "@/data/finances-schedules"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { formatDisplayDate, today } from "@shared/dates"
import {
  describeTerms,
  isEnded,
  nextInChain,
  scheduleChain,
  type Occurrence,
} from "@shared/finances/occurrences"
import { format } from "@shared/money"

type ScheduleListRow = {
  schedule: Schedule
  label: string
  next: Occurrence | null
  /** Its newest Schedule's end date has passed. */
  ended: boolean
}

/** Every Schedule, grouped by the Wallet it draws on, soonest first. */
export function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules()
  const { data: wallets } = useWallets()
  const { data: accounts } = useFinancesAccounts()
  const [creating, setCreating] = useState(false)

  const walletName = new Map(wallets.map((wallet) => [wallet.id, wallet.name]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const { data: stored } = useStoredOccurrences()
  const now = today()
  // A chain of Schedules changed from a date is one row, under its newest Schedule.
  const continued = new Set(schedules.map((schedule) => schedule.predecessorId))
  const rows: ScheduleListRow[] = schedules
    .filter((schedule) => !continued.has(schedule.id))
    .map((schedule) => ({
      schedule,
      label: scheduleLabel(schedule, walletName, accountName),
      next: nextInChain(scheduleChain(schedules, schedule.id), stored, now)?.occurrence ?? null,
      ended: isEnded(schedule, now),
    }))
  const running = rows.filter((row) => !row.ended)
  const groups = wallets
    .map((wallet) => ({
      wallet,
      rows: running.filter((row) => row.schedule.walletId === wallet.id).toSorted(bySoonest),
    }))
    .filter((group) => group.rows.length > 0)
  const ended = rows.filter((row) => row.ended).toSorted((a, b) => a.label.localeCompare(b.label))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Schedules</h1>
        <Button className="h-11" onClick={() => setCreating(true)}>
          <PlusIcon />
          New Schedule
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          No Schedules yet. Add rent, a bill or a paycheck that repeats.
        </p>
      ) : (
        <>
          {groups.map(({ wallet, rows: walletRows }) => (
            <section key={wallet.id} aria-label={wallet.name}>
              <h2 className="mb-1 text-sm font-medium text-muted-foreground">{wallet.name}</h2>
              <ul className="divide-y rounded-xl border">
                {walletRows.map((row) => (
                  <ScheduleRowItem key={row.schedule.id} row={row} wallet={wallet} />
                ))}
              </ul>
            </section>
          ))}
          {ended.length > 0 ? (
            <section aria-label="Ended" className="opacity-60">
              <h2 className="mb-1 text-sm font-medium text-muted-foreground">Ended</h2>
              <ul className="divide-y rounded-xl border">
                {ended.map((row) => {
                  const wallet = wallets.find((each) => each.id === row.schedule.walletId)
                  return wallet ? (
                    <ScheduleRowItem key={row.schedule.id} row={row} wallet={wallet} />
                  ) : null
                })}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle>New Schedule</DialogTitle>
            <DialogDescription>
              Money that moves again and again, such as rent on the 1st or pay every other Friday.
            </DialogDescription>
          </DialogHeader>
          {/* The form is taller than a phone, so it scrolls under a fixed header. */}
          <div className="-mx-4 overflow-y-auto px-4 pb-1">
            <ScheduleForm
              wallets={wallets.filter((wallet) => !wallet.archived)}
              onSave={async (schedule) => {
                // Stays open if the server refuses it, keeping what was typed.
                if (await addSchedule(schedule)) setCreating(false)
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Upcoming first by date; ended Schedules last. */
function bySoonest(a: ScheduleListRow, b: ScheduleListRow): number {
  if (a.next === null || b.next === null) return a.next === null ? (b.next === null ? 0 : 1) : -1
  return a.next.date.localeCompare(b.next.date) || a.label.localeCompare(b.label)
}

function ScheduleRowItem({ row, wallet }: { row: ScheduleListRow; wallet: Wallet }) {
  const { schedule, label, next } = row
  return (
    <li>
      <Link
        to="/finances/schedules/$scheduleId"
        params={{ scheduleId: schedule.id }}
        className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">
            {describeTerms(schedule)}
            {next
              ? ` · next ${formatDisplayDate(next.date)}`
              : schedule.endDate !== null && row.ended
                ? ` · ended ${formatDisplayDate(schedule.endDate)}`
                : " · no more Occurrences"}
          </p>
        </div>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {format(shownOnWallet(schedule, wallet, next?.amountCents ?? schedule.amountCents), {
            sign: "always",
          })}
        </span>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

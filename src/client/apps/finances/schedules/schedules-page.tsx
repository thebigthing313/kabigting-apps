import { PlusIcon } from "lucide-react"
import { useState } from "react"
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
import { addSchedule, useSchedules, type Schedule } from "@/data/finances-schedules"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { formatDisplayDate, today } from "@shared/dates"
import { describeTerms, nextOccurrence, type Occurrence } from "@shared/finances/occurrences"
import { toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

type ScheduleListRow = {
  schedule: Schedule
  label: string
  next: Occurrence | null
}

/** Every Schedule, grouped by the Wallet it draws on, soonest first. */
export function SchedulesPage() {
  const { data: schedules, isLoading } = useSchedules()
  const { data: wallets } = useWallets()
  const { data: accounts } = useFinancesAccounts()
  const [creating, setCreating] = useState(false)

  const walletName = new Map(wallets.map((wallet) => [wallet.id, wallet.name]))
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const now = today()
  // Occurrences are stored only once overridden, skipped or Reconciled; none can be yet.
  const rows: ScheduleListRow[] = schedules.map((schedule) => ({
    schedule,
    label: labelOf(schedule, walletName, accountName),
    next: nextOccurrence(schedule, [], now),
  }))
  const groups = wallets
    .map((wallet) => ({
      wallet,
      rows: rows.filter((row) => row.schedule.walletId === wallet.id).toSorted(bySoonest),
    }))
    .filter((group) => group.rows.length > 0)

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
      ) : groups.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          No Schedules yet. Add rent, a bill or a paycheck that repeats.
        </p>
      ) : (
        groups.map(({ wallet, rows: walletRows }) => (
          <section key={wallet.id} aria-label={wallet.name}>
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">{wallet.name}</h2>
            <ul className="divide-y rounded-xl border">
              {walletRows.map((row) => (
                <ScheduleRowItem key={row.schedule.id} row={row} wallet={wallet} />
              ))}
            </ul>
          </section>
        ))
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

/** The Account, or "Transfer to <Wallet>" for a Transfer. */
function labelOf(
  schedule: Schedule,
  walletName: ReadonlyMap<string, string>,
  accountName: ReadonlyMap<string, string>,
): string {
  if (schedule.toWalletId !== null) {
    return `Transfer to ${walletName.get(schedule.toWalletId) ?? "another Wallet"}`
  }
  const account = schedule.accountId === null ? undefined : accountName.get(schedule.accountId)
  return account ?? (schedule.note || "No Account")
}

/** Upcoming first by date; ended Schedules last. */
function bySoonest(a: ScheduleListRow, b: ScheduleListRow): number {
  if (a.next === null || b.next === null) return a.next === null ? (b.next === null ? 0 : 1) : -1
  return a.next.date.localeCompare(b.next.date) || a.label.localeCompare(b.label)
}

function ScheduleRowItem({ row, wallet }: { row: ScheduleListRow; wallet: Wallet }) {
  const { schedule, label, next } = row
  // On the Wallet it draws on, a Transfer is money out.
  const signed = (cents: number) => toShown(wallet, schedule.toWalletId === null ? cents : -cents)
  return (
    <li className="flex min-h-14 items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">
          {describeTerms(schedule)}
          {next ? ` · next ${formatDisplayDate(next.date)}` : " · no more Occurrences"}
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums">
        {format(signed(next?.amountCents ?? schedule.amountCents), { sign: "always" })}
      </span>
    </li>
  )
}

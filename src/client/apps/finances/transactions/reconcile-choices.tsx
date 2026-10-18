import { useState } from "react"
import { toast } from "sonner"
import { scheduleLabel } from "@/apps/finances/schedules/schedule-display"
import { transactionLabel } from "@/apps/finances/transactions/transaction-display"
import type { MatchesProps } from "@/apps/finances/transactions/transaction-form"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldContent, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { useFinancesAccounts } from "@/data/finances-accounts"
import { useStoredOccurrences } from "@/data/finances-occurrences"
import { useSchedules } from "@/data/finances-schedules"
import {
  reconcileActual,
  type Transaction,
  unreconcileActual,
  useOutstandingOneOffs,
} from "@/data/finances-transactions"
import { useWallets } from "@/data/finances-wallets"
import { addMonthsClamped, formatDisplayDate, today } from "@shared/dates"
import {
  outstandingPlanned,
  type PlannedItem,
  plannedKey,
  suggestMatches,
} from "@shared/finances/reconcile"
import type { Reconcile } from "@shared/finances/schemas"
import { toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

/** An outstanding Planned item with the name it is shown by. */
export type LabelledPlanned = PlannedItem & { label: string }

/** At least how far either side of an Actual's date Planned items are listed, in months. */
const MONTHS_BACK = 3
const MONTHS_AHEAD = 6

/**
 * A Wallet's outstanding Planned Transactions, by date: every outstanding one-off, and its
 * Schedules' Occurrences from their start to 6 months after `date`.
 */
export function useOutstandingPlanned(walletId: string, date: string): LabelledPlanned[] {
  const { data: schedules } = useSchedules()
  const { data: occurrences } = useStoredOccurrences()
  const { oneOffs } = useOutstandingOneOffs(walletId)
  const { data: accounts } = useFinancesAccounts()
  const { data: wallets } = useWallets()
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const walletName = new Map(wallets.map((wallet) => [wallet.id, wallet.name]))
  const scheduleOf = new Map(schedules.map((schedule) => [schedule.id, schedule]))
  const oneOffOf = new Map(oneOffs.map((row) => [row.id, row]))
  // Back to the Wallet's first Schedule, so any Overdue Occurrence can be picked; every
  // outstanding one-off, however far off.
  const dates = [
    addMonthsClamped(date, -MONTHS_BACK),
    addMonthsClamped(date, MONTHS_AHEAD),
    ...schedules.filter((schedule) => schedule.walletId === walletId).map((s) => s.startDate),
    ...oneOffs.map((row) => row.date),
  ].toSorted()
  const items = outstandingPlanned({
    walletId,
    schedules,
    occurrences,
    planned: oneOffs,
    range: { from: dates[0] ?? date, to: dates.at(-1) ?? date },
  })
  return items.map((item) => {
    if (item.kind === "occurrence") {
      const schedule = scheduleOf.get(item.scheduleId)
      return { ...item, label: schedule ? scheduleLabel(schedule, walletName, accountName) : "" }
    }
    const oneOff = oneOffOf.get(item.id)
    return { ...item, label: oneOff ? transactionLabel(oneOff, accountName) : "" }
  })
}

/** What the Reconcile command names: the Occurrence, or the one-off's id. */
export function reconcileBody(item: PlannedItem, actualId: string): Reconcile {
  return item.kind === "occurrence"
    ? {
        plannedKind: "occurrence",
        plannedRef: { scheduleId: item.scheduleId, nominalDate: item.nominalDate },
        actualId,
      }
    : { plannedKind: "transaction", plannedRef: item.id, actualId }
}

/** The label, date, Overdue mark and amount of a Planned item, as its Wallet shows them. */
function PlannedSummary({
  item,
  wallet,
}: {
  item: LabelledPlanned
  wallet: { shownAsOwed: boolean }
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.label}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {formatDisplayDate(item.date)}
          {item.date < today() ? " · Overdue" : null}
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums">
        {format(toShown(wallet, item.amountCents), { sign: "always" })}
      </span>
    </span>
  )
}

/**
 * The Add form's suggested Planned matches for the Actual being typed. A person may tick one to
 * Reconcile on save; ticking another moves the tick.
 */
export function SuggestedMatches({
  walletId,
  date,
  amountCents,
  selected,
  onSelect,
}: MatchesProps) {
  const outstanding = useOutstandingPlanned(walletId, date)
  const { data: wallets } = useWallets()
  const wallet = wallets.find((candidate) => candidate.id === walletId) ?? { shownAsOwed: false }
  const matches = suggestMatches({ walletId, date, amountCents }, outstanding)
  if (matches.length === 0) return null
  return (
    <FieldSet>
      <FieldLegend variant="label">Planned matches</FieldLegend>
      <ul className="divide-y rounded-lg border" aria-label="Planned matches">
        {matches.map((item) => {
          const key = plannedKey(item)
          const id = `match-${key}`
          return (
            <li key={key} className="px-3 py-2">
              <Field orientation="horizontal" className="items-center">
                <Checkbox
                  id={id}
                  checked={selected === key}
                  onCheckedChange={(checked) => onSelect(checked ? item : null)}
                />
                <FieldContent>
                  <FieldLabel htmlFor={id} className="w-full font-normal">
                    <PlannedSummary item={item} wallet={wallet} />
                  </FieldLabel>
                </FieldContent>
              </Field>
            </li>
          )
        })}
      </ul>
    </FieldSet>
  )
}

/** The Planned item an Actual is Reconciled to, by name and the date it was planned for. */
export type ReconciledTo = { label: string; date: string }

/**
 * What each of a Wallet's Reconciled Actuals is Reconciled to, by the Actual's id: an
 * Occurrence of one of its Schedules, or one of its one-off Planned items.
 */
export function useReconciledTo(walletId: string): ReadonlyMap<string, ReconciledTo> {
  const { data: occurrences } = useStoredOccurrences()
  const { data: schedules } = useSchedules()
  const { planned } = useOutstandingOneOffs(walletId)
  const { data: accounts } = useFinancesAccounts()
  const { data: wallets } = useWallets()
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const walletName = new Map(wallets.map((wallet) => [wallet.id, wallet.name]))
  const scheduleOf = new Map(schedules.map((schedule) => [schedule.id, schedule]))
  const reconciled = new Map<string, ReconciledTo>()
  for (const row of occurrences) {
    const schedule = scheduleOf.get(row.scheduleId)
    if (row.reconciledTransactionId === null || schedule?.walletId !== walletId) continue
    reconciled.set(row.reconciledTransactionId, {
      label: scheduleLabel(schedule, walletName, accountName),
      date: row.overrideDate ?? row.nominalDate,
    })
  }
  for (const row of planned) {
    if (row.reconciledActualId === null) continue
    reconciled.set(row.reconciledActualId, {
      label: transactionLabel(row, accountName),
      date: row.date,
    })
  }
  return reconciled
}

/**
 * The editor's Reconcile section for an Actual: what it is Reconciled to, with Un-Reconcile, or
 * the outstanding Planned items in its Wallet to Reconcile it to, suggestions first.
 */
export function ReconcileSection({
  actual,
  wallet,
  onDone,
}: {
  actual: Transaction
  wallet: { shownAsOwed: boolean }
  /** After a Reconcile or Un-Reconcile the server accepted. */
  onDone: () => void
}) {
  const reconciledTo = useReconciledTo(actual.walletId).get(actual.id)
  const outstanding = useOutstandingPlanned(actual.walletId, actual.date)
  const [picking, setPicking] = useState(false)
  const [pending, setPending] = useState(false)

  async function run(command: () => Promise<boolean>, done: string) {
    setPending(true)
    const ok = await command()
    setPending(false)
    if (ok) {
      toast.success(done)
      onDone()
    }
  }

  if (reconciledTo) {
    return (
      <section aria-labelledby="reconcile-heading" className="flex flex-col gap-2">
        <h3 id="reconcile-heading" className="font-medium">
          Reconciled
        </h3>
        <p className="text-sm text-muted-foreground">
          Reconciled to {reconciledTo.label}, planned for {formatDisplayDate(reconciledTo.date)}.
        </p>
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={pending}
          onClick={() => void run(() => unreconcileActual(actual.id), "Un-Reconciled")}
        >
          Un-Reconcile
        </Button>
      </section>
    )
  }

  // The suggestions first, best first; then every other outstanding item by date.
  const suggested = suggestMatches(actual, outstanding)
  const suggestedKeys = new Set(suggested.map(plannedKey))
  const choices = [
    ...suggested,
    ...outstanding.filter((item) => !suggestedKeys.has(plannedKey(item))),
  ]

  return (
    <section aria-labelledby="reconcile-heading" className="flex flex-col gap-2">
      <h3 id="reconcile-heading" className="font-medium">
        Reconcile
      </h3>
      <p className="text-sm text-muted-foreground">
        Not Reconciled to anything Planned. That&apos;s fine for unplanned spending.
      </p>
      {picking ? (
        choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing Planned is outstanding here.</p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Outstanding Planned">
            {choices.map((item) => (
              <li key={plannedKey(item)}>
                <button
                  type="button"
                  disabled={pending}
                  className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 disabled:opacity-50"
                  onClick={() =>
                    void run(() => reconcileActual(reconcileBody(item, actual.id)), "Reconciled")
                  }
                >
                  <PlannedSummary item={item} wallet={wallet} />
                  {suggestedKeys.has(plannedKey(item)) ? (
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">
                      Suggested
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (
        <Button variant="outline" className="h-11 self-start" onClick={() => setPicking(true)}>
          Reconcile to Planned…
        </Button>
      )}
    </section>
  )
}

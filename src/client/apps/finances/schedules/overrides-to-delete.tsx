import { shownOnWallet } from "@/apps/finances/schedules/schedule-display"
import type { Schedule } from "@/data/finances-schedules"
import { formatDisplayDate } from "@shared/dates"
import type { OccurrenceRow } from "@shared/finances/schemas"
import { format } from "@shared/money"

/**
 * The stored overrides and skips a change to a Schedule will delete, for the person to confirm.
 * Shows `empty` (or nothing) when there are none.
 */
export function OverridesToDelete({
  rows,
  schedule,
  wallet,
  why,
  empty,
}: {
  rows: readonly OccurrenceRow[]
  schedule: Pick<Schedule, "toWalletId" | "amountCents">
  wallet: { shownAsOwed: boolean }
  /** Why they go, under the heading. */
  why?: string
  empty?: string
}) {
  if (rows.length === 0) {
    return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
  }
  return (
    <section aria-labelledby="overrides-to-delete" className="flex flex-col gap-1">
      <h3 id="overrides-to-delete" className="text-sm font-medium">
        {rows.length === 1
          ? "This override will be deleted"
          : `These ${rows.length} overrides will be deleted`}
      </h3>
      {why ? <p className="text-sm text-muted-foreground">{why}</p> : null}
      <ul className="divide-y rounded-lg border text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex justify-between gap-3 px-3 py-2">
            <span>{formatDisplayDate(row.overrideDate ?? row.nominalDate)}</span>
            <span className="text-muted-foreground tabular-nums">
              {row.skipped
                ? "Skipped"
                : format(
                    shownOnWallet(
                      schedule,
                      wallet,
                      row.overrideAmountCents ?? schedule.amountCents,
                    ),
                    { sign: "always" },
                  )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * The Reconciled Occurrences that keep a Schedule from ending or changing from the date picked:
 * they would drop off it, and new terms falling on the same date would count them again.
 */
export function ReconciledInTheWay({ rows }: { rows: readonly OccurrenceRow[] }) {
  const [first] = rows
  if (!first) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      The Occurrence on {formatDisplayDate(first.nominalDate)} is Reconciled. Un-Reconcile it from
      its Wallet&apos;s Activity, or pick a later date.
    </p>
  )
}

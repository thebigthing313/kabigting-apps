import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { ChangeFromForm } from "@/apps/finances/schedules/change-from-form"
import {
  OverridesToDelete,
  ReconciledInTheWay,
} from "@/apps/finances/schedules/overrides-to-delete"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  changeScheduleFrom,
  deleteScheduleChain,
  endSchedule,
  reopenSchedule,
  type Schedule,
} from "@/data/finances-schedules"
import { addDays, formatDisplayDate, today } from "@shared/dates"
import { nextOccurrence, overridesAfter, reconciledFrom } from "@shared/finances/occurrences"
import type { OccurrenceRow } from "@shared/finances/schemas"

type Dialogs = "change" | "end" | "delete" | null

/**
 * The Schedule page's actions on the newest Schedule in a chain: Change from a date…, End… or
 * Reopen, and Delete when nothing is Reconciled to the chain.
 */
export function ScheduleActions({
  schedule,
  chainIds,
  stored,
  wallet,
  deletable,
}: {
  /** The newest Schedule in the chain. */
  schedule: Schedule
  chainIds: readonly string[]
  /** The newest Schedule's stored Occurrences. */
  stored: readonly OccurrenceRow[]
  wallet: { shownAsOwed: boolean }
  /** False when anything is Reconciled to the chain. */
  deletable: boolean
}) {
  const [open, setOpen] = useState<Dialogs>(null)
  const [reopening, setReopening] = useState(false)
  const close = () => setOpen(null)

  async function reopen() {
    setReopening(true)
    await reopenSchedule(schedule.id)
    setReopening(false)
  }

  const now = today()
  // The next date on the current terms after the Schedule starts.
  const after = now > schedule.startDate ? now : addDays(schedule.startDate, 1)
  const defaultFrom = nextOccurrence(schedule, [], after)?.nominalDate ?? after

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="h-11" onClick={() => setOpen("change")}>
        Change from a date…
      </Button>
      {schedule.endDate === null ? (
        <Button variant="outline" className="h-11" onClick={() => setOpen("end")}>
          End…
        </Button>
      ) : (
        <Button
          variant="outline"
          className="h-11"
          disabled={reopening}
          onClick={() => void reopen()}
        >
          Reopen
        </Button>
      )}
      {deletable ? (
        <Button variant="ghost" className="h-11 text-destructive" onClick={() => setOpen("delete")}>
          Delete…
        </Button>
      ) : null}

      <Dialog open={open === "change"} onOpenChange={(next) => setOpen(next ? "change" : null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle>Change from a date</DialogTitle>
            <DialogDescription>
              Occurrences before the date keep the current terms. Overrides from the date on move to
              the new terms.
            </DialogDescription>
          </DialogHeader>
          <div className="-mx-4 overflow-y-auto px-4 pb-1">
            <ChangeFromForm
              schedule={schedule}
              stored={stored}
              wallet={wallet}
              defaultFrom={defaultFrom}
              onSave={async (change) => {
                // Stays open if the server refuses it, keeping what was typed.
                if (await changeScheduleFrom(schedule.id, change)) close()
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {open === "end" ? (
        <EndDialog
          schedule={schedule}
          stored={stored}
          wallet={wallet}
          defaultEnd={now > schedule.startDate ? now : schedule.startDate}
          onClose={close}
        />
      ) : null}

      {open === "delete" ? <DeleteDialog chainIds={chainIds} onClose={close} /> : null}
    </div>
  )
}

/** Picks the end date and lists the overrides and skips after it that ending will delete. */
function EndDialog({
  schedule,
  stored,
  wallet,
  defaultEnd,
  onClose,
}: {
  schedule: Schedule
  stored: readonly OccurrenceRow[]
  wallet: { shownAsOwed: boolean }
  defaultEnd: string
  onClose: () => void
}) {
  const [endDate, setEndDate] = useState(defaultEnd)
  const [pending, setPending] = useState(false)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(endDate) && endDate >= schedule.startDate
  const doomed = valid ? overridesAfter(stored, endDate) : []
  const blocking = valid ? reconciledFrom(stored, addDays(endDate, 1)) : []

  async function end() {
    setPending(true)
    const ended = await endSchedule(
      schedule.id,
      endDate,
      doomed.map((row) => row.id),
    )
    setPending(false)
    if (ended) onClose()
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>End this Schedule</DialogTitle>
          <DialogDescription>
            No Occurrences after the end date. It can&apos;t end before a Reconciled one.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="-mx-4 flex flex-col gap-4 overflow-y-auto px-4 pb-1"
          onSubmit={(event) => {
            event.preventDefault()
            if (valid && blocking.length === 0) void end()
          }}
        >
          <Field data-invalid={valid ? undefined : true}>
            <FieldLabel htmlFor="end-date">Last day</FieldLabel>
            <Input
              id="end-date"
              type="date"
              className="h-11"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-invalid={valid ? undefined : true}
            />
            {valid ? null : (
              <FieldDescription className="text-destructive">
                Pick a date on or after {formatDisplayDate(schedule.startDate)}
              </FieldDescription>
            )}
          </Field>
          <OverridesToDelete
            rows={doomed}
            schedule={schedule}
            wallet={wallet}
            empty="No overrides will be deleted."
          />
          <ReconciledInTheWay rows={blocking} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="destructive"
              className="h-11"
              disabled={!valid || pending || blocking.length > 0}
            >
              End Schedule
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Deletes the whole chain, its history and overrides, after a confirmation. */
function DeleteDialog({ chainIds, onClose }: { chainIds: readonly string[]; onClose: () => void }) {
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)

  async function remove() {
    setPending(true)
    const deleted = await deleteScheduleChain(chainIds)
    setPending(false)
    if (deleted) await navigate({ to: "/finances/schedules" })
  }

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this Schedule?</AlertDialogTitle>
          <AlertDialogDescription>
            {chainIds.length > 1
              ? "Its history of earlier terms and every override go with it. "
              : "Every override goes with it. "}
            This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11" disabled={pending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-11"
            disabled={pending}
            onClick={() => void remove()}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

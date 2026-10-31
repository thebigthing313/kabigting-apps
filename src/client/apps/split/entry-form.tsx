// What an open Expense or Payment form does when another Member changes things, or the network
// fails: one pattern, used by the Expense flow and the Settle up form alike. The last save wins
// for the whole record, with no version check, so the form never merges anything in. It keeps
// its draft and says so when a newer version arrives; it leaves when what it changes is deleted
// or the viewer loses access; and a save that never reached the server stays put to be tried
// again, never automatically.
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"
import type { People } from "@/apps/split/words"
import { Button } from "@/components/ui/button"
import type { EntryOutcome } from "@/data/split"
import { formatInstantTime } from "@shared/dates"

/** Which kind of entry a form adds or changes, as the viewer reads it. */
export type EntryKind = "Expense" | "Payment"

/** A saved entry, as far as telling who changed it last and when. */
type Changed = { changedBy: string; changedAt: string }

/** What an open form tells the viewer, by its save button. */
export type EntryNotice =
  /** Someone saved a newer version; the draft is kept as it is. */
  | { kind: "newer"; changedBy: string; changedAt: string; onLoad: () => void }
  /** The last save never reached the server; nothing was saved. */
  | { kind: "offline" }

/**
 * The saved entry an edit page opens: the live row, undefined once it is gone, and whether the
 * rows have loaded, so that one not loaded yet isn't taken for gone.
 */
export type OpenedEntry<Row extends Changed> = { row: Row | undefined; loaded: boolean }

/**
 * Runs an Expense or Payment form's saves and deletes, and watches the entry it changes. Give it
 * `opened` when changing a saved entry; leave it out when adding one.
 *
 * - `formKey` mounts the form: it changes on **Load their version**, so the draft starts again
 *   from the newer version.
 * - `notice` is the newer-version or offline notice, or null.
 * - `save` sends a save and acts on its outcome; true when the form closes.
 * - `remove` leaves for Split's Home at once, then deletes in the background.
 * - `leave` goes back to Split's Home.
 */
export function useEntryForm<Row extends Changed>(kind: EntryKind, opened?: OpenedEntry<Row>) {
  const navigate = useNavigate()
  // The version the draft started from: the first one loaded, until Load their version.
  const [base, setBase] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [offline, setOffline] = useState(false)
  // Leaving tells the viewer once, whichever of a refetch and a save finds out first.
  const left = useRef(false)

  const row = opened?.row
  if (base === null && row) setBase(row.changedAt)

  function leave() {
    void navigate({ to: "/split" })
  }

  /** Leaves because the entry was deleted elsewhere; nothing is recreated. */
  function leaveGone() {
    if (left.current) return
    left.current = true
    toast(`This ${kind} was deleted, so your changes weren't saved`)
    leave()
  }

  /** Goes to the Shell's Home: nothing here can be saved any more, so the draft is dropped. */
  function toShellHome() {
    toast.error("You no longer have access to Split")
    void navigate({ to: "/" })
  }

  function leaveWithoutAccess() {
    if (left.current) return
    left.current = true
    toShellHome()
  }

  // A refetch found the entry gone while the form was open.
  const goneOnRefetch = base !== null && opened?.loaded === true && row === undefined
  const onGone = useEffectEvent(leaveGone)
  useEffect(() => {
    if (goneOnRefetch) onGone()
  }, [goneOnRefetch])

  /** Acts on how a write ended; true when the form closes. */
  function settle(outcome: EntryOutcome): boolean {
    if (outcome === "saved") {
      left.current = true
      leave()
    } else if (outcome === "gone") {
      leaveGone()
    } else if (outcome === "no-access") {
      leaveWithoutAccess()
    } else {
      // Refused (already reported) or unreached: the form stays, with everything kept.
      setOffline(outcome === "unreached")
      return false
    }
    return true
  }

  async function save(write: () => Promise<EntryOutcome>): Promise<boolean> {
    setOffline(false)
    setSaving(true)
    const outcome = await write()
    setSaving(false)
    return settle(outcome)
  }

  function remove(write: () => Promise<EntryOutcome>) {
    // Its own delete is no news: the entry going doesn't count as deleted elsewhere.
    left.current = true
    leave()
    // A delete that finds it already gone counts as deleted; any other failure is reported and
    // puts it back.
    void write().then((outcome) => {
      if (outcome === "no-access") toShellHome()
    })
  }

  // While this form's own save is in flight, the row shows that save, not someone else's.
  const newer = !saving && row !== undefined && base !== null && row.changedAt !== base
  const notice: EntryNotice | null = newer
    ? {
        kind: "newer",
        changedBy: row.changedBy,
        changedAt: row.changedAt,
        onLoad: () => setBase(row.changedAt),
      }
    : offline
      ? { kind: "offline" }
      : null

  return { formKey: base ?? "new", notice, save, remove, leave }
}

/**
 * The form's notice in a line: who changed it and when, with **Load their version**; or that the
 * save didn't reach the server, with **Try again**, which saves the draft as it now stands.
 */
export function EntryNoticeLine({
  notice,
  who,
  onRetry,
}: {
  notice: EntryNotice
  who: People
  onRetry: () => void
}) {
  if (notice.kind === "offline") {
    return (
      <div
        role="alert"
        className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        <span className="flex-1">You appear to be offline. Not saved.</span>
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <div role="status" className="flex flex-col items-start gap-1 rounded-lg bg-muted p-3 text-sm">
      <span>
        {who.nameOf(notice.changedBy)} changed this at {formatInstantTime(notice.changedAt)}. Saving
        will replace their change.
      </span>
      <Button size="sm" variant="link" className="h-auto p-0" onClick={notice.onLoad}>
        Load their version
      </Button>
    </div>
  )
}

/** An edit page's answer when the entry it opens doesn't exist: deleted, or never there. */
export function DeletedEntry({ kind, onBack }: { kind: EntryKind; onBack: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-start gap-3">
      <p>This {kind} was deleted.</p>
      <Button variant="outline" onClick={onBack}>
        Back to Split
      </Button>
    </div>
  )
}

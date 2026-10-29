import { CloudOffIcon, FileTextIcon, ListChecksIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { NoteKind } from "@shared/notes/schemas"

const KIND_NAMES: Record<NoteKind, string> = { text: "Text note", checklist: "Checklist" }

/**
 * Marks typed text that never reached the server; its field points here with
 * `aria-describedby={id}`. The text stays as typed and is retried on the next keystroke, on
 * returning to the app or on reconnecting.
 */
export function NotSaved({ id }: { id: string }) {
  return (
    <p className="flex items-center gap-1 text-xs text-destructive">
      <CloudOffIcon aria-hidden className="size-3.5" />
      <span id={id}>Not saved</span>
    </p>
  )
}

/** The icon for a Note's kind, named for screen readers. */
export function KindIcon({ kind, className }: { kind: NoteKind; className?: string }) {
  const Icon = kind === "checklist" ? ListChecksIcon : FileTextIcon
  return <Icon role="img" aria-label={KIND_NAMES[kind]} className={className} />
}

/** The current time, moving on every minute, so "… ago" stays true while a page is open. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

import { cn } from "cn"
import { FileTextIcon, ListChecksIcon } from "lucide-react"
import { useEffect, useState } from "react"
import type { NoteKind, NotePerson } from "@shared/notes/schemas"

const KIND_NAMES: Record<NoteKind, string> = { text: "Text note", checklist: "Checklist" }

/** The icon for a Note's kind, named for screen readers. */
export function KindIcon({ kind, className }: { kind: NoteKind; className?: string }) {
  const Icon = kind === "checklist" ? ListChecksIcon : FileTextIcon
  return <Icon role="img" aria-label={KIND_NAMES[kind]} className={className} />
}

const TINTS = ["bg-sky-600", "bg-amber-600", "bg-emerald-600", "bg-violet-600", "bg-rose-600"]

/** The same tint for the same Account everywhere. */
function tint(id: string): string {
  let sum = 0
  for (const char of id) sum = (sum * 31 + char.charCodeAt(0)) % 1_000_003
  return TINTS[sum % TINTS.length] ?? "bg-sky-600"
}

/** An Account's initial on a tinted circle, named for screen readers. */
export function Avatar({ person, className }: { person: NotePerson; className?: string }) {
  return (
    <span
      role="img"
      aria-label={person.name}
      title={person.name}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white ring-2 ring-background",
        tint(person.id),
        className,
      )}
    >
      {person.name.trim().slice(0, 1).toUpperCase()}
    </span>
  )
}

/** Overlapping avatars, for an Audience. */
export function AvatarStack({ people }: { people: readonly NotePerson[] }) {
  return (
    <span className="flex -space-x-1.5">
      {people.map((person) => (
        <Avatar key={person.id} person={person} />
      ))}
    </span>
  )
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

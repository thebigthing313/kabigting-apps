// PROTOTYPE, throwaway: the few tiny pieces every Notes variant draws the same way.
import { cn } from "cn"
import { FileTextIcon, ListChecksIcon } from "lucide-react"
import { accountName, type Note } from "@/apps/notes/prototype/store"

const TINTS = ["bg-sky-600", "bg-amber-600", "bg-emerald-600", "bg-violet-600"]
const tint = (id: string) =>
  TINTS[id.split("").reduce((sum, c) => sum + c.charCodeAt(0), 0) % TINTS.length]

export function Avatar({ id, className }: { id: string; className?: string }) {
  return (
    <span
      title={accountName(id)}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-semibold text-white ring-2 ring-background",
        tint(id),
        className,
      )}
    >
      {accountName(id).slice(0, 1)}
    </span>
  )
}

export function AvatarStack({ ids, className }: { ids: string[]; className?: string }) {
  return (
    <span className={cn("flex -space-x-1.5", className)}>
      {ids.map((id) => (
        <Avatar key={id} id={id} />
      ))}
    </span>
  )
}

export function KindIcon({ kind, className }: { kind: Note["kind"]; className?: string }) {
  const Icon = kind === "checklist" ? ListChecksIcon : FileTextIcon
  return (
    <Icon aria-label={kind === "checklist" ? "Checklist" : "Text note"} className={className} />
  )
}

/** The title, or for an untitled Note the start of its content. */
export function displayTitle(note: Note): string {
  if (note.title.trim()) return note.title
  const first = note.kind === "text" ? note.body : note.items[0]?.text
  return first?.split("\n")[0]?.trim() || "Untitled"
}

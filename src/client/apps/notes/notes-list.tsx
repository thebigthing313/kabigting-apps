import { FileTextIcon, PlusIcon } from "lucide-react"
import { KindIcon, useNow } from "@/apps/notes/note-parts"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Note } from "@/data/notes"
import { timeAgo } from "@shared/dates"
import { notePreview, orderNotes } from "@shared/notes/notes"
import type { NewNoteKind } from "@shared/notes/schemas"

/** Notes home: the New menu over one list of Notes, newest edit first. */
export function NotesList({
  notes,
  onNew,
  onOpen,
}: {
  notes: readonly Note[]
  /** Starts a new Note of the kind picked; its kind never changes afterwards. */
  onNew: (kind: NewNoteKind) => void
  onOpen: (id: string) => void
}) {
  const now = useNow()
  const ordered = orderNotes(notes)
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="flex-1 text-2xl font-semibold">Notes</h1>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="lg" />}>
            <PlusIcon /> New
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onNew("text")}>
              <FileTextIcon /> Text note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {ordered.length === 0 ? (
        <div className="rounded-xl border px-4 py-8 text-center text-muted-foreground">
          <p className="font-medium text-foreground">No notes yet</p>
          <p>Use New to write one.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {ordered.map((note) => {
            const { heading, snippet } = notePreview(note)
            return (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => onOpen(note.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left first:rounded-t-xl last:rounded-b-xl hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <KindIcon
                    kind={note.kind}
                    className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{heading}</span>
                    {snippet && (
                      <span className="truncate text-sm text-muted-foreground">{snippet}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(note.editedAt, now)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

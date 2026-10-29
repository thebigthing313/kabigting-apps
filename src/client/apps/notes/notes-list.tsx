import { FileTextIcon, ListChecksIcon, PlusIcon, UsersIcon } from "lucide-react"
import { Avatar, KindIcon, useNow } from "@/apps/notes/note-parts"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Item, Note } from "@/data/notes"
import { timeAgo } from "@shared/dates"
import { checklistCounts } from "@shared/notes/items"
import { notePreview, orderNotes, sharingLine } from "@shared/notes/notes"
import type { NoteKind } from "@shared/notes/schemas"

const NO_ITEMS: readonly Item[] = []

/** Notes home: the New menu over one list of every Note the viewer can see, newest edit first. */
export function NotesList({
  notes,
  viewerId,
  items,
  onNew,
  onOpen,
}: {
  notes: readonly Note[]
  /** The signed-in Account, so each row can say who else sees it. */
  viewerId: string
  /** Every Checklist's Items, for the rows' previews and counts. */
  items: readonly Item[]
  /** Starts a new Note of the kind picked; its kind never changes afterwards. */
  onNew: (kind: NoteKind) => void
  onOpen: (id: string) => void
}) {
  const now = useNow()
  const ordered = orderNotes(notes)
  const itemsByNote = new Map<string, Item[]>()
  for (const item of items) {
    itemsByNote.set(item.noteId, [...(itemsByNote.get(item.noteId) ?? []), item])
  }
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
            <DropdownMenuItem onClick={() => onNew("checklist")}>
              <ListChecksIcon /> Checklist
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
            const noteItems = itemsByNote.get(note.id) ?? NO_ITEMS
            const { heading, snippet } = notePreview(note, noteItems)
            const counts = note.kind === "checklist" ? checklistCounts(noteItems) : null
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
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {note.creator.id !== viewerId ? (
                        <Avatar person={note.creator} className="size-4 text-[0.55rem] ring-1" />
                      ) : note.audience.length > 0 ? (
                        <UsersIcon aria-hidden className="size-3.5" />
                      ) : null}
                      <span className="truncate">
                        {counts && `${counts.unchecked} to do · ${counts.checked} done · `}
                        {sharingLine(note, viewerId)} · {timeAgo(note.editedAt, now)}
                      </span>
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

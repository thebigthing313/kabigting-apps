import { ArrowLeftIcon, MoreVerticalIcon } from "lucide-react"
import { useState } from "react"
import { ChecklistItems } from "@/apps/notes/checklist-items"
import { useNow } from "@/apps/notes/note-parts"
import { useNoteDraft, type DraftItem, type NoteDraftOptions } from "@/apps/notes/use-note-draft"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { timeAgo } from "@shared/dates"
import type { NoteKind } from "@shared/notes/schemas"

export type NoteEditorProps = Omit<NoteDraftOptions, "initial"> & {
  /** The Note as last loaded; `editedAt` is null until it is first saved. */
  note: { kind: NoteKind; title: string | null; body: string | null; editedAt: string | null }
  /** A Checklist's Items as last loaded. */
  items?: readonly DraftItem[]
  /**
   * Called once the Creator confirms a delete; from then on nothing more is saved. `onServer`
   * resolves, after any save in flight settles, to whether the Note is on the server to delete.
   */
  onDelete: (onServer: Promise<boolean>) => void
  onBack: () => void
}

/**
 * A Note as its own page: a back arrow and the ⋯ menu, a large title, then the plain-text body
 * exactly as typed or the Checklist's Items, and when it was last edited. Typing saves on its
 * own; there is no Save button.
 */
export function NoteEditor({
  note,
  items = [],
  saved,
  onDelete,
  onBack,
  ...handlers
}: NoteEditorProps) {
  const {
    draft: { fields, items: draftItems },
    change,
    discard,
    ...checklist
  } = useNoteDraft({
    initial: { fields: { title: note.title ?? "", body: note.body ?? "" }, items: [...items] },
    saved,
    ...handlers,
  })
  const [confirming, setConfirming] = useState(false)
  const now = useNow()

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-lg" aria-label="Back to notes" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="More" />}>
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
              Delete note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <input
        aria-label="Title"
        value={fields.title}
        onChange={(event) => change("title", event.target.value)}
        placeholder="Title"
        maxLength={200}
        className="bg-transparent text-2xl font-semibold outline-none placeholder:text-muted-foreground/60"
      />
      {note.kind === "checklist" ? (
        <ChecklistItems
          items={draftItems}
          newItemText={checklist.newItemText}
          onTypeNewItem={checklist.typeNewItem}
          onAddItem={checklist.addItem}
          onChangeItem={checklist.changeItem}
          onToggleItem={checklist.toggleItem}
          onDeleteItem={checklist.deleteItem}
          onLeaveItem={checklist.leaveItem}
          autoFocusAdd={!saved}
        />
      ) : (
        // A plain textarea: the body is shown exactly as typed, never as Markdown or links.
        <textarea
          aria-label="Note"
          value={fields.body}
          onChange={(event) => change("body", event.target.value)}
          placeholder="Note"
          autoFocus={!saved}
          className="min-h-[50vh] resize-none bg-transparent text-base leading-relaxed whitespace-pre-wrap outline-none placeholder:text-muted-foreground/60"
        />
      )}
      {note.editedAt !== null && (
        <p className="text-xs text-muted-foreground">Edited {timeAgo(note.editedAt, now)}</p>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              It is deleted for good. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="h-11"
              onClick={() => {
                setConfirming(false)
                onDelete(discard())
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

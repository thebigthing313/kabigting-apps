import { ArrowLeftIcon, MoreVerticalIcon, UsersIcon } from "lucide-react"
import { useState } from "react"
import { ChecklistItems } from "@/apps/notes/checklist-items"
import { Avatar, AvatarStack, useNow } from "@/apps/notes/note-parts"
import { AudienceSheet, ShareSheet } from "@/apps/notes/share-sheet"
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
import type { AudienceMember, NoteKind, NotePerson } from "@shared/notes/schemas"

export type NoteEditorProps = Omit<NoteDraftOptions, "initial"> & {
  /** The Note as last loaded; `editedAt` is null until it is first saved. */
  note: {
    kind: NoteKind
    title: string | null
    body: string | null
    editedAt: string | null
    creator: NotePerson
    audience: readonly AudienceMember[]
  }
  /** A Checklist's Items as last loaded. */
  items?: readonly DraftItem[]
  /** The signed-in Account: the Creator gets Share and Delete, everyone else Leave. */
  viewerId: string
  /** Who the Creator can share with; undefined while loading. */
  people: readonly NotePerson[] | undefined
  /** The Creator's new Audience, saved at once. */
  onShare: (audience: AudienceMember[]) => void
  /**
   * Called once the Creator confirms a delete; from then on nothing more is saved. `onServer`
   * resolves, after any save in flight settles, to whether the Note is on the server to delete.
   */
  onDelete: (onServer: Promise<boolean>) => void
  /**
   * Called when an Audience member chooses Leave. Typing still waiting to save is saved at once,
   * and nothing after; `settled` resolves once those saves have settled.
   */
  onLeave: (settled: Promise<unknown>) => void
  onBack: () => void
}

/**
 * A Note as its own page: a back arrow, who it is shared with, the ⋯ menu, a large title, then
 * the plain-text body exactly as typed or the Checklist's Items, and when it was last edited.
 * Typing saves on its own; there is no Save button. Everyone who sees it edits it; only its
 * Creator shares or deletes it, and only an Audience member Leaves it.
 */
export function NoteEditor({
  note,
  items = [],
  saved,
  viewerId,
  people,
  onShare,
  onDelete,
  onLeave,
  onBack,
  ...handlers
}: NoteEditorProps) {
  const {
    draft: { fields, items: draftItems, newItemText },
    change,
    discard,
    ...checklist
  } = useNoteDraft({
    initial: { fields: { title: note.title ?? "", body: note.body ?? "" }, items: [...items] },
    saved,
    ...handlers,
  })
  const [confirming, setConfirming] = useState(false)
  const [sharing, setSharing] = useState(false)
  const now = useNow()
  const isCreator = note.creator.id === viewerId
  const isShared = note.audience.length > 0

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-lg" aria-label="Back to notes" onClick={onBack}>
          <ArrowLeftIcon />
        </Button>
        <span className="flex-1" />
        {!isCreator ? (
          // Opens who else can see it, read-only.
          <Button
            variant="ghost"
            size="lg"
            className="text-muted-foreground"
            onClick={() => setSharing(true)}
          >
            <Avatar person={note.creator} />
            <span>Shared by {note.creator.name}</span>
          </Button>
        ) : (
          // A new Note can be shared once it is saved.
          saved && (
            <Button variant="outline" size="lg" onClick={() => setSharing(true)}>
              {isShared ? <AvatarStack people={note.audience} /> : <UsersIcon />}
              {isShared ? "Shared" : "Share"}
            </Button>
          )
        )}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label="More" />}>
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isCreator ? (
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                Delete note
              </DropdownMenuItem>
            ) : (
              // No confirmation: the Note stays for everyone else, and its Creator can add them
              // back. Typing not yet saved is saved first, for them; nothing saves after.
              <DropdownMenuItem onClick={() => onLeave(checklist.saveAndStop())}>
                Leave note
              </DropdownMenuItem>
            )}
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
          newItemText={newItemText}
          onTypeNewItem={checklist.typeNewItem}
          onAddItem={checklist.addItem}
          onChangeItem={checklist.changeItem}
          onToggleItem={checklist.toggleItem}
          onMoveItem={checklist.moveItem}
          onDeleteItem={checklist.deleteItem}
          onBlurItem={checklist.blurItem}
          onClearChecked={checklist.clearChecked}
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
      {!isCreator && (
        <AudienceSheet
          open={sharing}
          onOpenChange={setSharing}
          creator={note.creator}
          audience={note.audience}
          viewerId={viewerId}
        />
      )}
      {isCreator && saved && (
        <ShareSheet
          open={sharing}
          onOpenChange={setSharing}
          audience={note.audience}
          people={people}
          onShare={onShare}
        />
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

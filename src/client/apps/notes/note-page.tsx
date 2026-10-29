import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { NoteEditor } from "@/apps/notes/note-editor"
import { Skeleton } from "@/components/ui/skeleton"
import {
  addItem,
  createNote,
  deleteItem,
  deleteNote,
  leaveNote,
  shareNote,
  updateItem,
  updateNote,
  useNote,
  useNoteItems,
  useNotePeople,
} from "@/data/notes"
import type { NoteKind } from "@shared/notes/schemas"

const appRoute = getRouteApi("/_app")

/**
 * One Note's page. `newKind` marks a Note just started from the New menu: until its first save
 * with content it exists only here, so leaving it empty leaves nothing behind.
 */
export function NotePage({ noteId, newKind }: { noteId: string; newKind?: NoteKind | undefined }) {
  const { session } = appRoute.useRouteContext()
  const { note, isLoading } = useNote(noteId)
  // Only the Creator of a saved Note picks who sees it.
  const people = useNotePeople(note !== undefined && note.creator.id === session.user.id)
  const { data: items, isLoading: itemsLoading } = useNoteItems(noteId)
  const navigate = useNavigate()
  const back = () => void navigate({ to: "/notes" })

  if (isLoading || itemsLoading) return <Skeleton className="mx-auto h-64 w-full max-w-2xl" />
  if (!note && newKind === undefined) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 text-muted-foreground">
        {/* Deleted, or no longer shared with this Account: either way, nothing is announced. */}
        <p className="font-medium text-foreground">This note isn't available</p>
        <Link to="/notes" className="text-primary underline-offset-4 hover:underline">
          Back to notes
        </Link>
      </div>
    )
  }

  const kind = note?.kind ?? newKind ?? "text"
  const creator = { id: session.user.id, name: session.user.name }
  return (
    <NoteEditor
      // A fresh editor per Note, so one Note's typing never carries into another.
      key={noteId}
      note={
        note ?? {
          kind,
          title: null,
          body: kind === "text" ? "" : null,
          editedAt: null,
          creator,
          audience: [],
        }
      }
      items={items}
      saved={note !== undefined}
      viewerId={session.user.id}
      people={people.data}
      onShare={(audience) => void shareNote(noteId, audience)}
      onCreate={(fields) => createNote(noteId, kind, creator, fields)}
      onUpdate={(changes) => updateNote(noteId, changes)}
      onAddItem={(item) => addItem(noteId, item)}
      onUpdateItem={updateItem}
      onDeleteItem={deleteItem}
      onDelete={(onServer) => {
        back()
        // Once any save in flight lands, delete the Note if it reached the server; one that
        // never did has nothing to delete.
        void onServer.then((stored) => stored && deleteNote(noteId))
      }}
      onLeave={(settled) => {
        back()
        // After any save in flight lands, so it can't put the Note back in view.
        void settled.then(() => leaveNote(noteId))
      }}
      onBack={back}
    />
  )
}

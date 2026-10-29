import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { NoteEditor } from "@/apps/notes/note-editor"
import { Skeleton } from "@/components/ui/skeleton"
import {
  createTextNote,
  deleteNote,
  shareNote,
  updateNote,
  useNote,
  useNotePeople,
} from "@/data/notes"
import type { NewNoteKind } from "@shared/notes/schemas"

const appRoute = getRouteApi("/_app")

/**
 * One Note's page. `newKind` marks a Note just started from the New menu: until its first save
 * with content it exists only here, so leaving it empty leaves nothing behind.
 */
export function NotePage({
  noteId,
  newKind,
}: {
  noteId: string
  newKind?: NewNoteKind | undefined
}) {
  const { session } = appRoute.useRouteContext()
  const { note, isLoading } = useNote(noteId)
  // Only the Creator of a saved Note picks who sees it.
  const people = useNotePeople(note !== undefined && note.creator.id === session.user.id)
  const navigate = useNavigate()
  const back = () => void navigate({ to: "/notes" })

  if (isLoading) return <Skeleton className="mx-auto h-64 w-full max-w-2xl" />
  if (!note && newKind === undefined) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-2 text-muted-foreground">
        <p className="font-medium text-foreground">This note isn't here</p>
        <p>It may have been deleted.</p>
        <Link to="/notes" className="text-primary underline-offset-4 hover:underline">
          Back to notes
        </Link>
      </div>
    )
  }

  const creator = { id: session.user.id, name: session.user.name }
  return (
    <NoteEditor
      // A fresh editor per Note, so one Note's typing never carries into another.
      key={noteId}
      note={
        note ?? {
          kind: newKind ?? "text",
          title: null,
          body: "",
          editedAt: null,
          creator,
          audience: [],
        }
      }
      saved={note !== undefined}
      viewerId={session.user.id}
      people={people.data}
      onShare={(audience) => void shareNote(noteId, audience)}
      onCreate={(fields) => createTextNote(noteId, creator, fields)}
      onUpdate={(changes) => updateNote(noteId, changes)}
      onDelete={(onServer) => {
        back()
        // Once any save in flight lands, delete the Note if it reached the server; one that
        // never did has nothing to delete.
        void onServer.then((stored) => stored && deleteNote(noteId))
      }}
      onBack={back}
    />
  )
}

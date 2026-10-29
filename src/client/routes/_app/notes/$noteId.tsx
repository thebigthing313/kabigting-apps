import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { NotePage } from "@/apps/notes/note-page"
import { createNote } from "@shared/notes/schemas"

export const Route = createFileRoute("/_app/notes/$noteId")({
  // `new` marks a Note just started from the New menu, with the kind picked; anything else is
  // ignored rather than failing the page.
  validateSearch: z.object({ new: createNote.shape.kind.optional().catch(undefined) }),
  component: NoteRoute,
})

function NoteRoute() {
  const { noteId } = Route.useParams()
  const search = Route.useSearch()
  return <NotePage noteId={noteId} newKind={search.new} />
}

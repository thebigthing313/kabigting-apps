import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { NotePage } from "@/apps/notes/note-page"
import { fromTab } from "@/apps/notes/notes-search"
import { noteKind } from "@shared/notes/schemas"

export const Route = createFileRoute("/_app/notes/$noteId")({
  // `new` marks a Note just started from the New menu, with the kind picked; `tab` is the Notes
  // tab it was opened from. Anything else is ignored rather than failing the page.
  validateSearch: z.object({ new: noteKind.optional().catch(undefined), tab: fromTab }),
  component: NoteRoute,
})

function NoteRoute() {
  const { noteId } = Route.useParams()
  const search = Route.useSearch()
  return <NotePage noteId={noteId} newKind={search.new} tab={search.tab} />
}

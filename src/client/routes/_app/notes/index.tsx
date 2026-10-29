import { createFileRoute } from "@tanstack/react-router"
import { NotesHome } from "@/apps/notes/notes-home"
import { notesSearch } from "@/apps/notes/notes-search"

export const Route = createFileRoute("/_app/notes/")({
  // The picked tab lives in the URL, so leaving a Note returns to it.
  validateSearch: notesSearch,
  component: NotesRoute,
})

function NotesRoute() {
  const { tab } = Route.useSearch()
  return <NotesHome tab={tab} />
}

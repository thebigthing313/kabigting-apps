import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { NotesHome } from "@/apps/notes/notes-home"
import { NOTE_TABS } from "@shared/notes/notes"

export const Route = createFileRoute("/_app/notes/")({
  // The picked tab lives in the URL, so going back from a Note returns to it. An unknown tab
  // falls back to All rather than failing the page.
  validateSearch: z.object({ tab: z.enum(NOTE_TABS).optional().catch(undefined) }),
  component: NotesRoute,
})

function NotesRoute() {
  const { tab } = Route.useSearch()
  return <NotesHome tab={tab ?? "all"} />
}

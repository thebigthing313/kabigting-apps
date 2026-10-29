import { createFileRoute } from "@tanstack/react-router"
import { NotesHome } from "@/apps/notes/notes-home"

export const Route = createFileRoute("/_app/notes/")({
  component: NotesHome,
})

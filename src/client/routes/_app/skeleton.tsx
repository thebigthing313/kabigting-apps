import { createFileRoute, notFound } from "@tanstack/react-router"
import { NotesPage } from "@/apps/skeleton/notes-page"

export const Route = createFileRoute("/_app/skeleton")({
  // An App the Account cannot open is not shown at all.
  beforeLoad: ({ context }) => {
    if (!context.apps.includes("skeleton")) throw notFound()
  },
  component: NotesPage,
})

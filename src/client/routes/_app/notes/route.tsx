import { createFileRoute, notFound } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/notes")({
  // An App the Account cannot open is not shown at all.
  beforeLoad: ({ context }) => {
    if (!context.apps.includes("notes")) throw notFound()
  },
})

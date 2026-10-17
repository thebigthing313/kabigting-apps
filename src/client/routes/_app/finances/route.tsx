import { createFileRoute, notFound } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/finances")({
  // An App the Account cannot open is not shown at all.
  beforeLoad: ({ context }) => {
    if (!context.apps.includes("finances")) throw notFound()
  },
})

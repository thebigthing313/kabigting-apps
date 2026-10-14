import { createFileRoute, notFound } from "@tanstack/react-router"

export const Route = createFileRoute("/_app/skeleton")({
  // An App the Account cannot open is not shown at all.
  beforeLoad: ({ context }) => {
    if (!context.apps.includes("skeleton")) throw notFound()
  },
  component: SkeletonPage,
})

function SkeletonPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">Notes</h1>
    </div>
  )
}

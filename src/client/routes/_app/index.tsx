import { createFileRoute, Link } from "@tanstack/react-router"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { APPS } from "@/shell/apps"

export const Route = createFileRoute("/_app/")({
  component: AppLauncher,
})

/** Home: one card per App the Account may open. */
function AppLauncher() {
  const { session, apps } = Route.useRouteContext()
  const available = APPS.filter((app) => apps.includes(app.key))

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Hello, {session.user.name}</h1>
      {available.length === 0 ? (
        <p className="text-muted-foreground">
          No Apps have been shared with you yet. Ask the Admin for access.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((app) => (
            <li key={app.key}>
              <Link
                to={app.to}
                className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Card className="min-h-28 transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <app.icon className="mb-2 size-6 text-primary" />
                    <CardTitle>{app.title}</CardTitle>
                    <CardDescription>{app.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

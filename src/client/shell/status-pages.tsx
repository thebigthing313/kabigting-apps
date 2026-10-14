import { type ErrorComponentProps, Link } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

function StatusPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="max-w-sm text-muted-foreground">{children}</div>
    </main>
  )
}

export function NotFoundPage() {
  return (
    <StatusPage title="Page not found">
      <p>There is nothing at this address.</p>
      <Button className="mt-4 h-11" render={<Link to="/" />}>
        Go home
      </Button>
    </StatusPage>
  )
}

export function ErrorPage({ error }: ErrorComponentProps) {
  return (
    <StatusPage title="Something went wrong">
      <p>{(error instanceof Error && error.message) || "An unexpected error happened."}</p>
      <Button className="mt-4 h-11" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </StatusPage>
  )
}

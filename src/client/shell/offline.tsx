import { WifiOffIcon } from "lucide-react"
import { useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}

/** Online-first: without a network the shell opens, says so, and offers to retry. */
export function OfflineScreen() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOffIcon className="size-10 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">You're offline</h1>
      <p className="max-w-sm text-muted-foreground">
        Kabigting Apps needs a connection to load your data. It will pick up where you left off once
        you're back online.
      </p>
      <Button className="h-11" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </main>
  )
}

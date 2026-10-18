import { useLocation } from "@tanstack/react-router"
import { useEffect } from "react"

/**
 * Scrolls to the element the address's `#hash` names once `ready`, for a page whose content
 * loads after the router has already tried. Runs again when the hash changes.
 */
export function useScrollToHash(ready: boolean): void {
  const hash = useLocation({ select: (location) => location.hash })
  useEffect(() => {
    if (!ready || hash === "") return
    document.getElementById(hash)?.scrollIntoView({ block: "start" })
  }, [ready, hash])
}

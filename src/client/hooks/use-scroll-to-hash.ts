import { useLocation } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

/**
 * Scrolls to the element the address's `#hash` names once `ready`, for a page whose content
 * loads after the router has already tried. Each hash scrolls once, not again on a reload of the
 * content.
 */
export function useScrollToHash(ready: boolean): void {
  const hash = useLocation({ select: (location) => location.hash })
  const scrolled = useRef("")
  useEffect(() => {
    if (!ready || hash === "" || scrolled.current === hash) return
    const element = document.getElementById(hash)
    if (!element) return
    scrolled.current = hash
    element.scrollIntoView({ block: "start" })
  }, [ready, hash])
}

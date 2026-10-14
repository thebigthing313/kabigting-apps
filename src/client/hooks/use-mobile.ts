import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function isMobileNow() {
  return window.matchMedia(QUERY).matches
}

// shadcn's version sets state inside an effect, which the React Compiler rules reject.
export function useIsMobile() {
  return useSyncExternalStore(subscribe, isMobileNow)
}

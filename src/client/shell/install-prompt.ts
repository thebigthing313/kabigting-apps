// Chrome and Edge fire `beforeinstallprompt` early, maybe before React mounts, so the event is
// captured as soon as this module loads (imported from main.tsx). iOS never fires it.
import { useSyncExternalStore } from "react"

type InstallPromptEvent = Event & { prompt: () => Promise<{ outcome: "accepted" | "dismissed" }> }

type InstallState = { prompt: InstallPromptEvent | null; installed: boolean }

let state: InstallState = { prompt: null, installed: isStandalone() }
const listeners = new Set<() => void>()

function isStandalone(): boolean {
  const iosStandalone = "standalone" in navigator && navigator.standalone === true
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return "prompt" in event && typeof event.prompt === "function"
}

function update(next: Partial<InstallState>) {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault()
  if (isInstallPromptEvent(event)) update({ prompt: event })
})
window.addEventListener("appinstalled", () => update({ prompt: null, installed: true }))

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => state,
  )
}

export async function promptInstall(): Promise<void> {
  if (!state.prompt) return
  const { outcome } = await state.prompt.prompt()
  update({ prompt: null, installed: outcome === "accepted" })
}

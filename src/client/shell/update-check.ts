// When to look for a new deploy: at launch (registration), when the app comes back to the
// foreground or online (installed apps are suspended, not reloaded), about hourly, and when the
// server reports a build other than the one running.
let registration: ServiceWorkerRegistration | undefined

const HOUR = 60 * 60 * 1000

export function checkForUpdate(): void {
  if (!registration || !navigator.onLine) return
  registration.update().catch(() => {
    // Offline or the server is restarting; the next trigger tries again.
  })
}

export function startUpdateChecks(registered: ServiceWorkerRegistration): void {
  registration = registered
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate()
  })
  window.addEventListener("online", checkForUpdate)
  setInterval(checkForUpdate, HOUR)
}

/** Called with every API response's `X-App-Version`. */
export function noticeServerVersion(serverVersion: string | null): void {
  if (!serverVersion || APP_BUILD_ID === "dev" || serverVersion === "dev") return
  if (serverVersion !== APP_BUILD_ID) checkForUpdate()
}

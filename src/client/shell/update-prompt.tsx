import { useEffect } from "react"
import { toast } from "sonner"
import { useRegisterSW } from "virtual:pwa-register/react"
import { saveAllDrafts } from "@/shell/drafts"
import { startUpdateChecks } from "@/shell/update-check"

const TOAST_ID = "app-update"

function reloadKeepingDrafts() {
  saveAllDrafts()
  window.location.reload()
}

/** Registers the service worker and offers "Update available — Reload" when a deploy lands. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (registration) startUpdateChecks(registration)
    },
    // The new worker has taken control: keep drafts, then load the new build.
    onNeedReload: reloadKeepingDrafts,
  })

  useEffect(() => {
    if (!needRefresh) return
    toast("Update available", {
      id: TOAST_ID,
      duration: Number.POSITIVE_INFINITY,
      action: {
        label: "Reload",
        onClick: () => {
          void updateServiceWorker()
          // On a first visit no worker controls the page, so no "controlling" event will come
          // to trigger the reload; the new worker serves the next load either way.
          if (!navigator.serviceWorker.controller) reloadKeepingDrafts()
        },
      },
    })
  }, [needRefresh, updateServiceWorker])

  return null
}

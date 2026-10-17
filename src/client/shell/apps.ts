import { WalletIcon, type LucideIcon } from "lucide-react"
import { APPS as SHARED_APPS, type AppKey } from "@shared/apps"

/** Client-side description of each App the Shell can host; key and title come from shared. */
export type AppEntry = {
  key: AppKey
  title: string
  description: string
  to: "/finances"
  icon: LucideIcon
}

// Every shared App key needs an entry here, so adding an App without its client side fails to compile.
const CLIENT_APPS: Record<AppKey, Omit<AppEntry, "key" | "title">> = {
  finances: {
    description: "Plan and track the household's money",
    to: "/finances",
    icon: WalletIcon,
  },
}

export const APPS: readonly AppEntry[] = SHARED_APPS.map((app) => ({
  ...app,
  ...CLIENT_APPS[app.key],
}))

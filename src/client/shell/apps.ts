import {
  ChartColumnIcon,
  HouseIcon,
  NotebookPenIcon,
  RepeatIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"
import type { FileRouteTypes } from "@/routeTree.gen"
import { APPS as SHARED_APPS, type AppKey } from "@shared/apps"

/** A page the router can link to. */
export type AppRoute = FileRouteTypes["to"]

/** One of an App's sections, listed in the sidebar while the App is open. */
export type SidebarItem = { title: string; to: AppRoute; icon: LucideIcon }

/** Client-side description of each App the Shell can host; key and title come from shared. */
export type AppEntry = {
  key: AppKey
  title: string
  description: string
  /** The App's home; every page of the App lives under it. */
  to: "/finances" | "/notes"
  icon: LucideIcon
  /** The App's sections; empty when the App's home is its only top-level page. */
  sidebar: readonly SidebarItem[]
}

// Every shared App key needs an entry here, so adding an App without its client side fails to compile.
const CLIENT_APPS: Record<AppKey, Omit<AppEntry, "key" | "title">> = {
  finances: {
    description: "Plan and track the household's money",
    to: "/finances",
    icon: WalletIcon,
    sidebar: [
      { title: "Home", to: "/finances", icon: HouseIcon },
      { title: "Schedules", to: "/finances/schedules", icon: RepeatIcon },
      { title: "Wallets", to: "/finances/wallets", icon: WalletIcon },
      { title: "Summary", to: "/finances/summary", icon: ChartColumnIcon },
    ],
  },
  notes: {
    description: "Jot down short notes",
    to: "/notes",
    icon: NotebookPenIcon,
    sidebar: [],
  },
}

export const APPS: readonly AppEntry[] = SHARED_APPS.map((app) => ({
  ...app,
  ...CLIENT_APPS[app.key],
}))

/** `pathname` without a trailing slash, so `/finances/` and `/finances` compare equal. */
function trimSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
}

/** True when `pathname` is `to` itself or one of its child pages. */
export function isWithin(pathname: string, to: string): boolean {
  const path = trimSlash(pathname)
  return path === to || path.startsWith(`${to}/`)
}

/** The App whose pages `pathname` is on, or undefined at Home and on the Admin pages. */
export function appAt(pathname: string): AppEntry | undefined {
  return APPS.find((app) => isWithin(pathname, app.to))
}

/**
 * Whether an App's sidebar item is the current page. The App's home matches only itself; any
 * other section stays active on its child pages.
 */
export function isSectionActive(pathname: string, item: SidebarItem, app: AppEntry): boolean {
  return item.to === app.to ? trimSlash(pathname) === app.to : isWithin(pathname, item.to)
}

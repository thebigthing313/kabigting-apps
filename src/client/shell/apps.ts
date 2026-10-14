import { NotebookPenIcon, type LucideIcon } from "lucide-react"

/** Client-side description of each App the Shell can host, keyed like `app_access`. */
export type AppEntry = {
  key: string
  title: string
  description: string
  to: "/skeleton"
  icon: LucideIcon
}

export const APPS: readonly AppEntry[] = [
  {
    key: "skeleton",
    title: "Notes",
    description: "The walking skeleton's sample App",
    to: "/skeleton",
    icon: NotebookPenIcon,
  },
]

import { z } from "zod"
import { NOTE_TABS } from "@shared/notes/notes"

/**
 * The Notes home's search params: the tab picked. A missing or unknown tab means All, so the
 * default lives here and nowhere else.
 */
export const notesSearch = z.object({ tab: z.enum(NOTE_TABS).default("all").catch("all") })

/**
 * The tab a Note was opened from, carried on its page so the back arrow returns there. Anything
 * else is ignored, and going back then lands on the home's default.
 */
export const fromTab = z.enum(NOTE_TABS).optional().catch(undefined)

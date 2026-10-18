// An Account or Category added inline from a picker shows at once, before the server has stored
// it. A form must not save a row naming it until then, or the foreign key refuses the save.
import { settled } from "@/data/settled"

/** A name added inline: its id at once, and whether the server stored it once it answers. */
export type InlineAdd = { id: string; saved: Promise<boolean> }

/** Creates not yet confirmed, and creates refused, by id. */
const unconfirmed = new Map<string, Promise<boolean>>()

/** Remembers an optimistic insert until the server stores it. */
export function trackInlineAdd(
  id: string,
  transaction: { when: (state: "settled") => Promise<unknown> },
): InlineAdd {
  const saved = settled(transaction)
  unconfirmed.set(id, saved)
  void saved.then((ok) => {
    if (ok) unconfirmed.delete(id)
  })
  return { id, saved }
}

/**
 * Waits for any inline adds among these ids. True when each one is stored, or was never pending;
 * false when one was refused, and then nothing naming it should be sent.
 */
export async function inlineAddsSaved(ids: readonly (string | null)[]): Promise<boolean> {
  const results = await Promise.all(
    ids.flatMap((id) => {
      const saved = id === null ? undefined : unconfirmed.get(id)
      return saved ? [saved] : []
    }),
  )
  return results.every(Boolean)
}

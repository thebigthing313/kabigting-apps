import { useEffect, useState } from "react"
import type { NoteFields } from "@/data/notes"
import { isEmptyNote } from "@shared/notes/notes"

/** How long typing must pause before a field saves. */
export const SAVE_DELAY_MS = 1_000

type Field = keyof NoteFields

type Handlers = {
  /** Stores a new Note with everything typed so far; resolves true once stored. */
  onCreate: (fields: NoteFields) => Promise<boolean>
  /** Stores one field's latest text; resolves true once stored. */
  onUpdate: (changes: Partial<NoteFields>) => Promise<boolean>
}

export type NoteDraftOptions = Handlers & {
  initial: NoteFields
  /** Whether the Note exists on the server yet. A new one exists only here until it has content. */
  saved: boolean
}

/**
 * The saving behind an editor, outside React so it outlives the page: pending saves still run
 * after the editor unmounts.
 */
function createAutosave(initial: NoteFields, saved: boolean, first: Handlers) {
  let latest = initial
  let exists = saved
  let handlers = first
  const timers = new Map<Field, ReturnType<typeof setTimeout>>()
  // Saves run one at a time, so a field's update never overtakes the create.
  let queue: Promise<unknown> = Promise.resolve()

  function save(field: Field) {
    queue = queue.then(async () => {
      if (exists) {
        await handlers.onUpdate({ [field]: latest[field] })
      } else if (!isEmptyNote(latest)) {
        // The create carries every field typed so far.
        exists = await handlers.onCreate({ ...latest })
      }
    })
  }

  return {
    setHandlers(next: Handlers) {
      handlers = next
    },

    /** Takes a field's new text and saves it once typing pauses. Returns every field. */
    change(field: Field, value: string): NoteFields {
      latest = { ...latest, [field]: value }
      clearTimeout(timers.get(field))
      timers.set(
        field,
        setTimeout(() => {
          timers.delete(field)
          save(field)
        }, SAVE_DELAY_MS),
      )
      return latest
    },

    /** Saves every field still waiting for its pause, now. */
    flush() {
      for (const [field, timer] of timers) {
        clearTimeout(timer)
        save(field)
      }
      timers.clear()
    },

    /** Drops typing that has not saved yet, such as when the Note is being deleted. */
    cancel() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}

/**
 * The editor's own copy of a Note's typed fields, saved on its own: each field about a second
 * after typing pauses, independently of the other. A new Note is created by its first save with
 * content, so one left empty is never stored; a saved Note stays even when emptied. Leaving
 * flushes what is pending.
 */
export function useNoteDraft({ initial, saved, onCreate, onUpdate }: NoteDraftOptions) {
  const [fields, setFields] = useState(initial)
  const [autosave] = useState(() => createAutosave(initial, saved, { onCreate, onUpdate }))

  // Later saves use the latest render's callbacks.
  useEffect(() => {
    autosave.setHandlers({ onCreate, onUpdate })
  })
  useEffect(() => () => autosave.flush(), [autosave])

  return {
    fields,
    change: (field: Field, value: string) => setFields(autosave.change(field, value)),
    cancel: () => autosave.cancel(),
  }
}

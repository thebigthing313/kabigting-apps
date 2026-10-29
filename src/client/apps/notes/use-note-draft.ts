import { useEffect, useState } from "react"
import { createTypedTextSaver, useTypedTextLifecycle } from "@/apps/notes/typed-text"
import type { NoteFields, SaveOptions, SaveOutcome } from "@/data/notes"
import { isEmptyNote } from "@shared/notes/notes"

type Field = keyof NoteFields

type Handlers = {
  /** Stores a new Note with everything typed so far. */
  onCreate: (fields: NoteFields, options: SaveOptions) => Promise<SaveOutcome>
  /** Stores one field's latest text. */
  onUpdate: (changes: Partial<NoteFields>, options: SaveOptions) => Promise<SaveOutcome>
}

export type NoteDraftOptions = Handlers & {
  initial: NoteFields
  /** Whether the Note exists on the server yet. A new one exists only here until it has content. */
  saved: boolean
}

/** A Note's typed fields and their saving, outside React so pending saves outlive the editor. */
function createNoteDraft(
  initial: NoteFields,
  saved: boolean,
  first: Handlers,
  onNotSaved: (fields: ReadonlySet<Field>) => void,
) {
  let latest = initial
  let exists = saved
  let handlers = first
  let discarded = false
  /** The create on its way, which every field's save waits for; the fields it carries. */
  let creating: Promise<SaveOutcome> | null = null
  let created: NoteFields | null = null

  /** Creates the Note with everything typed so far, once for every field asking at once. */
  function create(options: SaveOptions): Promise<SaveOutcome> {
    if (creating) return creating
    const fields = { ...latest }
    creating = handlers
      .onCreate(fields, options)
      .catch((): SaveOutcome => "refused")
      .then((outcome) => {
        creating = null
        if (outcome === "saved") {
          exists = true
          created = fields
        }
        return outcome
      })
    return creating
  }

  const saver = createTypedTextSaver<Field>({
    read: (field) => latest[field],
    onNotSaved,
    save: async (field, text, options) => {
      if (!exists) {
        // An empty new Note is never stored.
        if (isEmptyNote(latest)) return "saved"
        // The create carries every field typed so far; a field's update must never reach the
        // server before it.
        const outcome = await create(options)
        if (!exists) return outcome
        // Nothing more is saved once a delete has begun, nor what the create already carried.
        if (discarded || created?.[field] === text) return "saved"
      }
      return handlers.onUpdate({ [field]: text }, options)
    },
  })

  return {
    saver,

    setHandlers(next: Handlers) {
      handlers = next
    },

    /** Takes a field's new text and saves it once typing pauses. Returns every field. */
    change(field: Field, value: string): NoteFields {
      latest = { ...latest, [field]: value }
      saver.changed(field)
      return latest
    },

    /**
     * Stops saving for good, as the Note is being deleted: typing not yet saved is dropped and
     * no queued save runs. Resolves, once the saves on their way have settled, to whether the
     * Note is on the server, so a create that lands mid-delete is deleted too.
     */
    async discard(): Promise<boolean> {
      discarded = true
      await saver.stop()
      return exists
    },
  }
}

/**
 * The editor's own copy of a Note's typed fields, saved on its own: each field about a second
 * after typing pauses, independently of the other. A new Note is created by its first save with
 * content, so one left empty is never stored; a saved Note stays even when emptied. A field whose
 * save can't reach the server keeps its text and is listed in `notSaved` until a retry lands.
 * Hiding or leaving the page, or unmounting, sends what is not yet saved at once.
 */
export function useNoteDraft({ initial, saved, onCreate, onUpdate }: NoteDraftOptions) {
  const [fields, setFields] = useState(initial)
  const [notSaved, setNotSaved] = useState<ReadonlySet<Field>>(() => new Set())
  const [draft] = useState(() =>
    createNoteDraft(initial, saved, { onCreate, onUpdate }, setNotSaved),
  )

  // Later saves use the latest render's callbacks.
  useEffect(() => {
    draft.setHandlers({ onCreate, onUpdate })
  })
  useTypedTextLifecycle(draft.saver)

  return {
    fields,
    notSaved,
    change: (field: Field, value: string) => setFields(draft.change(field, value)),
    discard: () => draft.discard(),
  }
}

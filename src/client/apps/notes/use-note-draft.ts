import { useEffect, useState } from "react"
import type { ItemChanges, NewItem, NoteFields } from "@/data/notes"
import { nowInstant } from "@shared/dates"
import { newId } from "@shared/ids"
import { appendPosition, orderItems } from "@shared/notes/items"
import { isBlankItem, isEmptyNote } from "@shared/notes/notes"

/** How long typing must pause before a field saves. */
export const SAVE_DELAY_MS = 1_000

type Field = keyof NoteFields

/** An Item as its Checklist's editor holds it. */
export type DraftItem = {
  id: string
  text: string
  checked: boolean
  checkedAt: string | null
  position: string
}

/** Everything an editor holds: the typed fields and, for a Checklist, its Items. */
export type NoteDraft = { fields: NoteFields; items: DraftItem[] }

type Handlers = {
  /** Stores a new Note with everything typed so far; resolves true once stored. */
  onCreate: (fields: NoteFields) => Promise<boolean>
  /** Stores one field's latest text; resolves true once stored. */
  onUpdate: (changes: Partial<NoteFields>) => Promise<boolean>
  /** Stores a new Item in the saved Checklist; resolves true once stored. */
  onAddItem: (item: NewItem) => Promise<boolean>
  /** Stores one change to one Item; resolves true once stored. */
  onUpdateItem: (id: string, changes: ItemChanges) => Promise<boolean>
  /** Deletes one Item; resolves true once deleted. */
  onDeleteItem: (id: string) => Promise<boolean>
}

export type NoteDraftOptions = Handlers & {
  initial: NoteDraft
  /** Whether the Note exists on the server yet. A new one exists only here until it has content. */
  saved: boolean
}

/** A timer key: a field, or one Item's text. */
type SaveKey = Field | `item:${string}`

/**
 * The saving behind an editor, outside React so it outlives the page: pending saves still run
 * after the editor unmounts.
 */
function createAutosave(initial: NoteDraft, saved: boolean, first: Handlers) {
  let latest = initial
  let exists = saved
  /** The Items the server holds; the rest exist only here so far. */
  const storedItems = new Set(initial.items.map((item) => item.id))
  let discarded = false
  let handlers = first
  const timers = new Map<SaveKey, ReturnType<typeof setTimeout>>()
  // Saves run one at a time, so a field's update never overtakes the create, an Item never
  // reaches the server before its Checklist, and a delete can wait for the save in flight.
  let queue: Promise<unknown> = Promise.resolve()

  function enqueue(write: () => Promise<unknown>) {
    queue = queue
      .then(async () => {
        // A save queued before the Note was deleted must not land after the delete.
        if (!discarded) await write()
      })
      // A failed save is reported where it failed; the saves behind it still run.
      .catch(() => {})
  }

  const findItem = (id: string) => latest.items.find((item) => item.id === id)

  /** Creates the Note with everything typed so far, once there is something. */
  async function ensureNote(): Promise<boolean> {
    if (!exists && !isEmptyNote(latest.fields, latest.items)) {
      exists = await handlers.onCreate({ ...latest.fields })
    }
    return exists
  }

  function saveField(field: Field) {
    enqueue(async () => {
      if (exists) await handlers.onUpdate({ [field]: latest.fields[field] })
      else await ensureNote()
    })
  }

  /** Saves an Item's latest text: the first save with text adds it. Blank text waits. */
  function saveItemText(id: string) {
    enqueue(async () => {
      // An Item deleted meanwhile is never brought back by a late save.
      const item = findItem(id)
      if (!item || isBlankItem(item)) return
      if (storedItems.has(id)) {
        await handlers.onUpdateItem(id, { text: item.text })
      } else if (await ensureNote()) {
        const { text, position } = item
        if (await handlers.onAddItem({ id, text, position })) storedItems.add(id)
      }
    })
  }

  function save(key: SaveKey) {
    if (key === "title" || key === "body") saveField(key)
    else saveItemText(key.slice("item:".length))
  }

  function schedule(key: SaveKey) {
    clearTimeout(timers.get(key))
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key)
        save(key)
      }, SAVE_DELAY_MS),
    )
  }

  /** Runs an Item's pending text save now, ahead of a change that must follow it. */
  function settleItemText(id: string) {
    const key: SaveKey = `item:${id}`
    if (!timers.has(key) && storedItems.has(id)) return
    clearTimeout(timers.get(key))
    timers.delete(key)
    saveItemText(id)
  }

  function setItems(items: DraftItem[]) {
    latest = { ...latest, items }
  }

  function removeItem(id: string) {
    clearTimeout(timers.get(`item:${id}`))
    timers.delete(`item:${id}`)
    setItems(latest.items.filter((item) => item.id !== id))
    enqueue(async () => {
      if (storedItems.has(id) && (await handlers.onDeleteItem(id))) storedItems.delete(id)
    })
  }

  /** What is typed in the "Add item" row, not yet an Item. */
  let adding = ""

  function addTyped(id: string) {
    const text = adding
    adding = ""
    if (isBlankItem({ text })) return
    const unchecked = orderItems(latest.items).unchecked
    const position = appendPosition(unchecked.map((item) => item.position))
    setItems([...latest.items, { id, text, checked: false, checkedAt: null, position }])
    saveItemText(id)
  }

  return {
    setHandlers(next: Handlers) {
      handlers = next
    },

    /** Takes a field's new text and saves it once typing pauses. */
    change(field: Field, value: string): NoteDraft {
      latest = { ...latest, fields: { ...latest.fields, [field]: value } }
      schedule(field)
      return latest
    },

    /** Takes what is typed in the "Add item" row, added on Enter, on leaving the row or the page. */
    typeNewItem(text: string) {
      adding = text
    },

    /**
     * Adds what is typed in the "Add item" row as an Item at the bottom of the unchecked Items,
     * saving it at once. Blank text adds nothing.
     */
    addItem(id: string): NoteDraft {
      addTyped(id)
      return latest
    },

    /** Takes an Item's new text and saves it once typing pauses; blank text never saves. */
    changeItem(id: string, text: string): NoteDraft {
      setItems(latest.items.map((item) => (item.id === id ? { ...item, text } : item)))
      schedule(`item:${id}`)
      return latest
    },

    /**
     * Ticks or unticks an Item, saving at once. Unticking returns it to the bottom of the
     * unchecked Items. A blank Item can't be ticked.
     */
    toggleItem(id: string, checked: boolean): NoteDraft {
      const item = findItem(id)
      if (!item || item.checked === checked || isBlankItem(item)) return latest
      const unchecked = orderItems(latest.items).unchecked
      setItems(
        latest.items.map((each) =>
          each.id !== id
            ? each
            : checked
              ? { ...each, checked, checkedAt: nowInstant() }
              : {
                  ...each,
                  checked,
                  checkedAt: null,
                  position: appendPosition(unchecked.map((other) => other.position)),
                },
        ),
      )
      // Text still waiting to save goes first, so the Item exists to be ticked.
      settleItemText(id)
      enqueue(async () => {
        if (storedItems.has(id)) await handlers.onUpdateItem(id, { checked })
      })
      return latest
    },

    /** Deletes an Item at once. */
    deleteItem(id: string): NoteDraft {
      removeItem(id)
      return latest
    },

    /** An Item left blank is dropped. */
    leaveItem(id: string): NoteDraft {
      const item = findItem(id)
      if (item && isBlankItem(item)) removeItem(id)
      return latest
    },

    /** Saves everything still waiting for its pause, now, and drops blank Items. */
    flush() {
      addTyped(newId())
      const pending = [...timers.keys()]
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      for (const key of pending) save(key)
      for (const item of latest.items) if (isBlankItem(item)) removeItem(item.id)
    },

    /**
     * Stops saving for good, as the Note is being deleted: typing not yet saved is dropped and
     * no queued save runs. Resolves, once the save in flight has settled, to whether the Note
     * is on the server, so a create that lands mid-delete is deleted too.
     */
    discard(): Promise<boolean> {
      discarded = true
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      return queue.then(() => exists)
    },
  }
}

/**
 * The editor's own copy of a Note, saved on its own. Each typed field, and each Item's text,
 * saves about a second after typing pauses, independently of the others; adding, ticking and
 * deleting an Item save at once. A new Note is created by its first save with content, so one
 * left empty, or with only blank Items, is never stored; a saved Note stays even when emptied.
 * Leaving flushes what is pending.
 */
export function useNoteDraft({ initial, saved, ...handlers }: NoteDraftOptions) {
  const [draft, setDraft] = useState(initial)
  const [newItemText, setNewItemText] = useState("")
  const [autosave] = useState(() => createAutosave(initial, saved, handlers))

  // Later saves use the latest render's callbacks.
  useEffect(() => {
    autosave.setHandlers(handlers)
  })
  useEffect(() => () => autosave.flush(), [autosave])

  return {
    draft,
    change: (field: Field, value: string) => setDraft(autosave.change(field, value)),
    newItemText,
    typeNewItem: (text: string) => {
      autosave.typeNewItem(text)
      setNewItemText(text)
    },
    addItem: () => {
      setDraft(autosave.addItem(newId()))
      setNewItemText("")
    },
    changeItem: (id: string, text: string) => setDraft(autosave.changeItem(id, text)),
    toggleItem: (id: string, checked: boolean) => setDraft(autosave.toggleItem(id, checked)),
    deleteItem: (id: string) => setDraft(autosave.deleteItem(id)),
    leaveItem: (id: string) => setDraft(autosave.leaveItem(id)),
    discard: () => autosave.discard(),
  }
}

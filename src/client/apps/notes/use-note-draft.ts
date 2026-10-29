import { useEffect, useState } from "react"
import type { ItemChanges, NewItem, NoteFields } from "@/data/notes"
import { nowInstant } from "@shared/dates"
import { newId } from "@shared/ids"
import { bottomOfUnchecked, dropPosition } from "@shared/notes/items"
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

/**
 * Everything an editor holds: the typed fields and, for a Checklist, its Items and what is typed
 * in its "Add item" row, not yet an Item.
 */
export type NoteDraft = { fields: NoteFields; items: DraftItem[]; newItemText: string }

/** What the server stored for an Item: its tick time is the server's, not this device's. */
export type StoredItem = { checkedAt: string | null }

type Handlers = {
  /** Stores a new Note with everything typed so far; resolves true once stored. */
  onCreate: (fields: NoteFields) => Promise<boolean>
  /** Stores one field's latest text; resolves true once stored. */
  onUpdate: (changes: Partial<NoteFields>) => Promise<boolean>
  /** Stores a new Item in the saved Checklist; resolves true once stored. */
  onAddItem: (item: NewItem) => Promise<boolean>
  /** Stores one change to one Item; resolves to the Item as stored, or null after a refusal. */
  onUpdateItem: (id: string, changes: ItemChanges) => Promise<StoredItem | null>
  /** Deletes one Item; resolves true once deleted. */
  onDeleteItem: (id: string) => Promise<boolean>
}

export type NoteDraftOptions = Handlers & {
  initial: Omit<NoteDraft, "newItemText">
  /** Whether the Note exists on the server yet. A new one exists only here until it has content. */
  saved: boolean
}

/** Where changes go while no editor listens. */
function unheard(): void {}

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
  /** Items whose add is queued or in flight. */
  const addingItems = new Set<string>()
  /** Told of changes the server makes after a save, such as an Item's tick time. */
  let onSaved: (draft: NoteDraft) => void = unheard
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
    const adds = !storedItems.has(id)
    if (adds) addingItems.add(id)
    enqueue(async () => {
      try {
        // An Item deleted meanwhile is never brought back by a late save.
        const item = findItem(id)
        if (!item || isBlankItem(item)) return
        if (storedItems.has(id)) {
          await handlers.onUpdateItem(id, { text: item.text })
        } else if (await ensureNote()) {
          const { text, position } = item
          if (await handlers.onAddItem({ id, text, position })) storedItems.add(id)
        }
      } finally {
        if (adds) addingItems.delete(id)
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

  /**
   * Runs an Item's pending text save now, ahead of a change that must follow it. An Item that is
   * neither stored nor being added (its add failed) is added again.
   */
  function settleItemText(id: string) {
    const key: SaveKey = `item:${id}`
    if (!timers.has(key) && (storedItems.has(id) || addingItems.has(id))) return
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

  function addTyped(id: string) {
    const text = latest.newItemText
    latest = { ...latest, newItemText: "" }
    if (isBlankItem({ text })) return
    const position = bottomOfUnchecked(latest.items)
    setItems([...latest.items, { id, text, checked: false, checkedAt: null, position }])
    saveItemText(id)
  }

  /** Changes one Item, leaving the rest as they are. */
  function patchItem(id: string, changes: Partial<DraftItem>) {
    setItems(latest.items.map((each) => (each.id === id ? { ...each, ...changes } : each)))
  }

  /** Takes the server's tick time for an Item that is still checked here. */
  function takeTickTime(id: string, stored: StoredItem) {
    const item = findItem(id)
    if (!item?.checked || stored.checkedAt === null || stored.checkedAt === item.checkedAt) return
    patchItem(id, { checkedAt: stored.checkedAt })
    onSaved(latest)
  }

  return {
    setHandlers(next: Handlers) {
      handlers = next
    },

    listen(listener: (draft: NoteDraft) => void) {
      onSaved = listener
    },

    /** Takes a field's new text and saves it once typing pauses. */
    change(field: Field, value: string): NoteDraft {
      latest = { ...latest, fields: { ...latest.fields, [field]: value } }
      schedule(field)
      return latest
    },

    /** Takes what is typed in the "Add item" row, added on Enter, on leaving the row or the page. */
    typeNewItem(text: string): NoteDraft {
      latest = { ...latest, newItemText: text }
      return latest
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
      patchItem(id, { text })
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
      const position = bottomOfUnchecked(latest.items)
      // Shown at once with this device's time, then the server's, which orders checked Items.
      patchItem(
        id,
        checked ? { checked, checkedAt: nowInstant() } : { checked, checkedAt: null, position },
      )
      // Text still waiting to save goes first, so the Item exists to be ticked.
      settleItemText(id)
      enqueue(async () => {
        if (!storedItems.has(id)) return
        const stored = await handlers.onUpdateItem(id, { checked })
        if (stored) takeTickTime(id, stored)
      })
      return latest
    },

    /**
     * Moves an unchecked Item to `toIndex` among the unchecked Items, saving at once. Only its
     * position is written, so someone else's move of another Item stands. A refused move is
     * undone, unless the Item has moved again since.
     */
    moveItem(id: string, toIndex: number): NoteDraft {
      const position = dropPosition(latest.items, id, toIndex)
      const before = findItem(id)?.position
      if (position === null || before === undefined) return latest
      patchItem(id, { position })
      // Text still waiting to save goes first, so the Item exists to be moved.
      settleItemText(id)
      enqueue(async () => {
        if (!storedItems.has(id)) return
        if (await handlers.onUpdateItem(id, { position })) return
        if (findItem(id)?.position !== position) return
        patchItem(id, { position: before })
        onSaved(latest)
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
 * saves about a second after typing pauses, independently of the others; adding, ticking, moving
 * and deleting an Item save at once. A new Note is created by its first save with content, so one
 * left empty, or with only blank Items, is never stored; a saved Note stays even when emptied.
 * Leaving flushes what is pending.
 */
export function useNoteDraft({ initial, saved, ...handlers }: NoteDraftOptions) {
  const [first] = useState(() => ({ ...initial, newItemText: "" }))
  const [draft, setDraft] = useState(first)
  const [autosave] = useState(() => createAutosave(first, saved, handlers))

  // Later saves use the latest render's callbacks.
  useEffect(() => {
    autosave.setHandlers(handlers)
  })
  useEffect(() => {
    autosave.listen(setDraft)
    return () => {
      autosave.listen(unheard)
      autosave.flush()
    }
  }, [autosave])

  return {
    draft,
    change: (field: Field, value: string) => setDraft(autosave.change(field, value)),
    typeNewItem: (text: string) => setDraft(autosave.typeNewItem(text)),
    addItem: () => setDraft(autosave.addItem(newId())),
    changeItem: (id: string, text: string) => setDraft(autosave.changeItem(id, text)),
    toggleItem: (id: string, checked: boolean) => setDraft(autosave.toggleItem(id, checked)),
    moveItem: (id: string, toIndex: number) => setDraft(autosave.moveItem(id, toIndex)),
    deleteItem: (id: string) => setDraft(autosave.deleteItem(id)),
    leaveItem: (id: string) => setDraft(autosave.leaveItem(id)),
    discard: () => autosave.discard(),
  }
}

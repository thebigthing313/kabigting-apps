import { useEffect, useState } from "react"
import { createTypedTextSaver, useTypedTextLifecycle } from "@/apps/notes/typed-text"
import type { ItemChanges, NewItem, NoteFields, SaveOptions, SaveOutcome } from "@/data/notes"
import { nowInstant } from "@shared/dates"
import { newId } from "@shared/ids"
import { bottomOfUnchecked, dropPosition } from "@shared/notes/items"
import { isBlankItem, isEmptyNote } from "@shared/notes/notes"

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

/** A Note as last loaded from the server, or as this device last wrote it there. */
export type LoadedNote = { fields: NoteFields; items: readonly DraftItem[] }

/** What the server stored for an Item: its tick time is the server's, not this device's. */
export type StoredItem = { checkedAt: string | null }

/**
 * What a clear did on the server: the Items sent that it kept, as stored, because someone
 * unticked them first. Every other Item sent is gone.
 */
export type KeptItems = { kept: DraftItem[] }

type Handlers = {
  /** Stores a new Note with everything typed so far. */
  onCreate: (fields: NoteFields, options: SaveOptions) => Promise<SaveOutcome>
  /** Stores one field's latest text. */
  onUpdate: (changes: Partial<NoteFields>, options: SaveOptions) => Promise<SaveOutcome>
  /** Stores a new Item in the saved Checklist, as its text first saves. */
  onAddItem: (item: NewItem, options: SaveOptions) => Promise<SaveOutcome>
  /** Stores one Item's latest text. */
  onUpdateItemText: (id: string, text: string, options: SaveOptions) => Promise<SaveOutcome>
  /** Ticks or unticks one Item; resolves to the Item as stored, or null after a refusal. */
  onUpdateItem: (id: string, changes: ItemChanges) => Promise<StoredItem | null>
  /** Deletes one Item; resolves true once deleted. */
  onDeleteItem: (id: string) => Promise<boolean>
  /**
   * Deletes the Items given, those seen checked, that are still checked on the server; resolves
   * to what it kept, or null after a refusal.
   */
  onClearChecked: (ids: string[]) => Promise<KeptItems | null>
}

export type NoteDraftOptions = Handlers & {
  /**
   * The Note as last loaded. The editor starts from it, then takes in each change to it, such as
   * someone else's edit brought by a refetch, except where typing here has not saved yet.
   */
  loaded: LoadedNote
  /** Whether the Note exists on the server yet. A new one exists only here until it has content. */
  saved: boolean
}

/** An Item as the editor holds it, with `text` in place of the stored text when given. */
function toDraftItem(
  { id, text, checked, checkedAt, position }: DraftItem,
  typed: string | undefined,
): DraftItem {
  return { id, text: typed ?? text, checked, checkedAt, position }
}

/** Where changes go while no editor listens. */
function unheard(): void {}

/** Runs a save, counting one that throws, at once or later, as refused (reported where it failed). */
function attempt(save: () => Promise<SaveOutcome>): Promise<SaveOutcome> {
  return new Promise<SaveOutcome>((resolve) => resolve(save())).catch((): SaveOutcome => "refused")
}

/** A saving key: a field, or one Item's text. */
type SaveKey = Field | `item:${string}`

const itemKey = (id: string): SaveKey => `item:${id}`

/**
 * The saving behind an editor, outside React so it outlives the page: pending saves still run
 * after the editor unmounts. Typed text (the fields and each Item's text) saves through the
 * typed-text saver: "Not saved" and retried when it can't reach the server, sent at once on
 * leaving. Ticks and deletes run in order after their Item's text.
 */
function createAutosave(
  initial: NoteDraft,
  saved: boolean,
  first: Handlers,
  onNotSaved: (keys: ReadonlySet<SaveKey>) => void,
) {
  let latest = initial
  /** The Note as last loaded, to tell what a later load changed. */
  let loaded: LoadedNote = initial
  /** Items deleted or cleared here: a load that still holds one never brings it back. */
  const removedHere = new Set<string>()
  /**
   * Items a load no longer holds while text typed into them had not saved. Each stays, keeping
   * the text, until its save settles, and then goes. Its save is an edit, never an add, so it
   * can't bring the Item back: one deleted answers 404, and the viewer is told why the text went.
   */
  const goneWhileTyping = new Set<string>()
  /** Items with moves queued or on their way, and how many. */
  const moving = new Map<string, number>()
  /** The field or Item text that has focus: a load leaves it alone until it loses focus. */
  let focused: SaveKey | null = null
  /** Typed text a load changed while it was held, to catch up with once it is let go. */
  const behind = new Set<SaveKey>()
  /** Typed text whose save was refused: the next load's text is taken even while focused. */
  const rolledBack = new Set<SaveKey>()
  let exists = saved
  /** The Items the server holds; the rest exist only here so far. */
  const storedItems = new Set(initial.items.map((item) => item.id))
  /** The create on its way, which every save waits for, and the fields it carried. */
  let creating: Promise<SaveOutcome> | null = null
  let created: NoteFields | null = null
  /** Items whose add is on its way, and the text each add carried. */
  const addingItems = new Map<string, Promise<SaveOutcome>>()
  const addedText = new Map<string, string>()
  /** Items whose last add got no answer: the server may hold them, so a delete still goes. */
  const unsureItems = new Set<string>()
  /** Items with a tick or untick queued, which sends once their add lands. */
  const ticking = new Set<string>()
  /** Told of changes made outside a keystroke, such as an Item's tick time from the server. */
  let onChanged: (draft: NoteDraft) => void = unheard
  let discarded = false
  let handlers = first

  const findItem = (id: string) => latest.items.find((item) => item.id === id)
  /** Whether the last create got no answer, so the server may hold the Note after all. */
  let unsureNote = false

  /**
   * Creates the Note with everything typed so far, once for every save asking at once. Saves,
   * leaving's included, wait for a create on its way: nothing may reach the server before it, so
   * leaving during one can lose up to about a second of typing.
   */
  function ensureNote(options: SaveOptions): Promise<SaveOutcome> {
    if (exists) return Promise.resolve("saved")
    if (creating) return creating
    const fields = { ...latest.fields }
    creating = attempt(() => handlers.onCreate(fields, options)).then((outcome) => {
      creating = null
      // A create that got no answer may still have been stored.
      unsureNote = outcome === "unreached"
      if (outcome === "saved") {
        exists = true
        created = fields
      }
      return outcome
    })
    return creating
  }

  /**
   * Adds an Item with its text so far, after the Note exists; once for every save asking. Like
   * the create, saves of the Item wait for an add on its way. A tick made before the add landed
   * is sent once it has.
   */
  function addItemOnce(id: string, options: SaveOptions): Promise<SaveOutcome> {
    const adding = addingItems.get(id)
    if (adding) return adding
    const add = (async (): Promise<SaveOutcome> => {
      const note = await ensureNote(options)
      if (note !== "saved") return note
      const item = findItem(id)
      // Deleted or emptied meanwhile, or the Note is being deleted: nothing to add.
      if (discarded || !item || isBlankItem(item)) return "saved"
      const { text, position } = item
      let threw = false
      const outcome = await new Promise<SaveOutcome>((resolve) =>
        resolve(handlers.onAddItem({ id, text, position }, options)),
      ).catch((): SaveOutcome => {
        threw = true
        return "refused"
      })
      // An add that never got an answer may still have been stored.
      if (outcome === "unreached") unsureItems.add(id)
      else unsureItems.delete(id)
      // An add the server refused is undone, as its toast says. One that threw here never
      // reached it, and is added again by the Item's next save.
      if (outcome === "refused" && !threw && findItem(id)) {
        saver.forget(itemKey(id))
        setItems(latest.items.filter((each) => each.id !== id))
        onChanged(latest)
      }
      if (outcome === "saved") {
        storedItems.add(id)
        addedText.set(id, text)
        // An Item is added unchecked; a tick made before, and not already waiting, follows.
        if (findItem(id)?.checked && !ticking.has(id)) {
          saver.run(itemKey(id), () => tick(id, true))
        }
      }
      return outcome
    })()
    addingItems.set(id, add)
    void add.then(() => addingItems.delete(id))
    return add
  }

  /** Sends a tick or untick of a stored Item; a refused one is undone here too. */
  async function tick(id: string, checked: boolean) {
    const stored = await new Promise<StoredItem | null>((resolve) =>
      resolve(handlers.onUpdateItem(id, { checked })),
    ).catch(() => null)
    if (stored) takeTickTime(id, stored)
    else undoTick(id, checked)
  }

  async function saveField(field: Field, text: string, options: SaveOptions) {
    if (!exists) {
      // An empty new Note is never stored.
      if (isEmptyNote(latest.fields, latest.items)) return "saved"
      // The create carries every field typed so far; an update never reaches the server first.
      const outcome = await ensureNote(options)
      if (outcome !== "saved") return outcome
      if (discarded || created?.[field] === text) return "saved"
    }
    return handlers.onUpdate({ [field]: text }, options)
  }

  /** Saves an Item's text: its first save with text adds it. Blank text waits. */
  async function saveItemText(id: string, text: string, options: SaveOptions) {
    // An Item deleted meanwhile is never brought back by a late save.
    const item = findItem(id)
    if (!item || isBlankItem(item)) return "saved"
    if (!storedItems.has(id)) {
      const outcome = await addItemOnce(id, options)
      if (outcome !== "saved" || discarded || addedText.get(id) === text || !findItem(id)) {
        return outcome
      }
    }
    return handlers.onUpdateItemText(id, text, options)
  }

  /**
   * After a save of typed text settles. Saved, it is the last write, so a load it skipped no
   * longer matters. Refused, it was rolled back, so the field takes the server's text again,
   * whether the load that brings it came before or after. An Item gone from the server goes from
   * here too, once its text here has settled.
   */
  function textSettled(key: SaveKey, outcome: SaveOutcome | "failed"): void {
    if (outcome === "saved") behind.delete(key)
    // Even while it has focus: the toast just said the text didn't save. The load that rolls it
    // back may come after, and is taken the same way.
    if (outcome === "refused") {
      rolledBack.add(key)
      catchUp(key, true)
    }
    if (key === "title" || key === "body") return
    const id = key.slice("item:".length)
    if (!goneWhileTyping.has(id) || saver.holdsUnsaved(key)) return
    dropGone(id)
    onChanged(latest)
  }

  /** Whether typed text must stay as it is here: not saved yet, or being typed into. */
  function isHeld(key: SaveKey) {
    return focused === key || saver.holdsUnsaved(key)
  }

  /** The text the last load holds for a field or Item; undefined when it has no such Item. */
  function loadedText(key: SaveKey): string | undefined {
    if (key === "title" || key === "body") return loaded.fields[key]
    const id = key.slice("item:".length)
    return loaded.items.find((item) => item.id === id)?.text
  }

  /**
   * Takes the last load's text for a field, or for an Item the server holds, unless it is held
   * (by focus too, unless `evenFocused`). A new Note, or an Item not added yet, has nothing on the
   * server to take.
   */
  function catchUp(key: SaveKey, evenFocused = false) {
    if (evenFocused ? saver.holdsUnsaved(key) : isHeld(key)) return
    const text = loadedText(key)
    if (key === "title" || key === "body") {
      if (!exists || text === undefined) return
      behind.delete(key)
      saver.received(key, text)
      if (latest.fields[key] === text) return
      latest = { ...latest, fields: { ...latest.fields, [key]: text } }
    } else {
      const id = key.slice("item:".length)
      if (text === undefined || !storedItems.has(id) || !findItem(id)) return
      behind.delete(key)
      saver.received(key, text)
      if (findItem(id)?.text === text) return
      patchItem(id, { text })
    }
    onChanged(latest)
  }

  /** Takes a load's new text for a field or Item, or, while it is held, catches up later. */
  function takeText(key: SaveKey, text: string) {
    const refused = rolledBack.delete(key)
    if (refused ? saver.holdsUnsaved(key) : isHeld(key)) {
      behind.add(key)
      return
    }
    behind.delete(key)
    saver.received(key, text)
    if (key === "title" || key === "body") {
      if (latest.fields[key] !== text) {
        latest = { ...latest, fields: { ...latest.fields, [key]: text } }
      }
    } else {
      patchItem(key.slice("item:".length), { text })
    }
  }

  const saver = createTypedTextSaver<SaveKey>({
    read: (key) =>
      key === "title" || key === "body"
        ? latest.fields[key]
        : (findItem(key.slice("item:".length))?.text ?? ""),
    onNotSaved,
    onSettled: textSettled,
    save: (key, text, options) =>
      key === "title" || key === "body"
        ? saveField(key, text, options)
        : saveItemText(key.slice("item:".length), text, options),
  })

  /** Drops an Item the server no longer holds: nothing more saves or retries it. */
  function dropGone(id: string) {
    goneWhileTyping.delete(id)
    storedItems.delete(id)
    unsureItems.delete(id)
    saver.forget(itemKey(id))
    setItems(latest.items.filter((item) => item.id !== id))
  }

  /** Takes in an Item a load holds that the one before didn't. */
  function takeArrived(item: DraftItem) {
    goneWhileTyping.delete(item.id)
    if (findItem(item.id)) {
      // One being added is this device's own, shown before it lands. Any other is stored after
      // all, such as one whose add got no answer.
      if (!addingItems.has(item.id)) {
        storedItems.add(item.id)
        unsureItems.delete(item.id)
      }
      return
    }
    // Deleted here, and the load came before the server heard: it stays deleted.
    if (removedHere.has(item.id)) return
    // Someone else's.
    storedItems.add(item.id)
    saver.received(itemKey(item.id), item.text)
    setItems([...latest.items, toDraftItem(item, undefined)])
  }

  /**
   * Takes in what a load changed in an Item: its text, unless text typed here has not saved yet,
   * and its tick and place, unless a tick or move made here is still on its way.
   */
  function takeChanges(item: DraftItem, earlier: DraftItem) {
    if (item.text !== earlier.text) takeText(itemKey(item.id), item.text)
    const placed =
      item.checked !== earlier.checked ||
      item.checkedAt !== earlier.checkedAt ||
      item.position !== earlier.position
    if (placed && !ticking.has(item.id) && !moving.has(item.id)) {
      const { checked, checkedAt, position } = item
      patchItem(item.id, { checked, checkedAt, position })
    }
  }

  /**
   * Takes in a later load of the Note, such as a refetch with someone else's edits: whatever it
   * changed, except text typed here that has not saved yet (still pausing, on its way or "Not
   * saved"), which stays as typed and saves over it, the last write winning, and the text being
   * typed into, which takes the load once it loses focus. A load that began before a save here
   * landed never undoes it: the collections keep a write's answer over an older load's.
   */
  function receive(next: LoadedNote) {
    const before = latest
    const previous = loaded
    loaded = next
    for (const field of ["title", "body"] as const) {
      const text = next.fields[field]
      if (text !== previous.fields[field]) takeText(field, text)
    }
    const earlier = new Map(previous.items.map((item) => [item.id, item]))
    for (const item of next.items) {
      const was = earlier.get(item.id)
      if (!was) takeArrived(item)
      else if (findItem(item.id)) takeChanges(item, was)
    }
    // Items deleted elsewhere, or dropped as their writes found them gone.
    const held = new Set(next.items.map((item) => item.id))
    for (const { id } of previous.items) {
      if (held.has(id) || !findItem(id) || addingItems.has(id)) continue
      if (saver.holdsUnsaved(itemKey(id))) goneWhileTyping.add(id)
      else dropGone(id)
    }
    if (latest !== before) onChanged(latest)
  }

  /**
   * Saves an Item's text now, ahead of a change that must follow it, unless it is already
   * stored or on its way. An Item whose add failed is added again.
   */
  function settleItemText(id: string) {
    const key = itemKey(id)
    if (saver.hasPause(key) || (!storedItems.has(id) && !addingItems.has(id))) saver.saveNow(key)
  }

  function setItems(items: DraftItem[]) {
    latest = { ...latest, items }
  }

  function removeItem(id: string) {
    const key = itemKey(id)
    saver.forget(key)
    removedHere.add(id)
    goneWhileTyping.delete(id)
    setItems(latest.items.filter((item) => item.id !== id))
    saver.run(key, async () => {
      // An add on its way lands first, so the Item it stores is deleted too. One whose add got
      // no answer may be stored all the same: the delete goes anyway, and "already gone" is fine.
      await addingItems.get(id)
      if (!storedItems.has(id) && !unsureItems.has(id)) return
      const deleted = await new Promise<boolean>((resolve) =>
        resolve(handlers.onDeleteItem(id)),
      ).catch(() => false)
      if (deleted) {
        storedItems.delete(id)
        unsureItems.delete(id)
        return
      }
      // A refused delete is undone, as its toast says: the Item comes back as last loaded. One
      // not loaded now, such as one found gone, stays away; one the next load holds comes back.
      removedHere.delete(id)
      const back = loaded.items.find((item) => item.id === id)
      if (!back || findItem(id)) return
      setItems([...latest.items, toDraftItem(back, undefined)])
      onChanged(latest)
    })
  }

  /** Undoes a tick or untick the server refused, as its toast says. */
  function undoTick(id: string, checked: boolean) {
    const item = findItem(id)
    if (item?.checked !== checked) return
    setItems(
      latest.items.map((each) =>
        each.id === id
          ? { ...each, checked: !checked, checkedAt: checked ? null : each.checkedAt }
          : each,
      ),
    )
    onChanged(latest)
  }

  function addTyped(id: string) {
    const text = latest.newItemText
    latest = { ...latest, newItemText: "" }
    if (isBlankItem({ text })) return
    const position = bottomOfUnchecked(latest.items)
    setItems([...latest.items, { id, text, checked: false, checkedAt: null, position }])
    saver.saveNow(itemKey(id))
  }

  /** Before the page or Note is left: the "Add item" row becomes an Item and blank Items go. */
  function takeAddRowAndDropBlanks() {
    const before = latest
    addTyped(newId())
    for (const item of latest.items) if (isBlankItem(item)) removeItem(item.id)
    if (latest !== before) onChanged(latest)
  }

  /**
   * Clears the checked Items at once, here and then on the server, after the saves ahead of it,
   * so a tick just made is cleared too. A refused clear puts them back; an Item the server kept,
   * as someone unticked it first, comes back as stored. Either way an Item that comes back keeps
   * the text typed into it that had not saved yet, and saves it once typing would have paused.
   */
  function clearChecked() {
    const cleared = latest.items.filter((item) => item.checked)
    if (cleared.length === 0) return
    const ids = new Set(cleared.map((item) => item.id))
    // Text not yet saved, pausing or "Not saved", waits on the clear: it is moot if its Item goes.
    const typed = new Map(
      cleared
        .filter((item) => saver.hasUnsaved(itemKey(item.id)))
        .map((item) => [item.id, item.text]),
    )
    for (const id of ids) {
      saver.forget(itemKey(id))
      removedHere.add(id)
      goneWhileTyping.delete(id)
    }
    setItems(latest.items.filter((item) => !ids.has(item.id)))
    saver.run([...ids].map(itemKey), async () => {
      // Adds on their way land first, so the Items they store are cleared too.
      await Promise.all([...ids].map((id) => addingItems.get(id) ?? Promise.resolve()))
      const sent = [...ids].filter((id) => storedItems.has(id))
      if (sent.length > 0) {
        const result = await new Promise<KeptItems | null>((resolve) =>
          resolve(handlers.onClearChecked(sent)),
        ).catch(() => null)
        const returned = result === null ? cleared : result.kept
        const survivors = new Set(returned.map((item) => item.id))
        for (const id of sent) if (!survivors.has(id)) storedItems.delete(id)
        for (const id of survivors) removedHere.delete(id)
        const here = new Set(latest.items.map((item) => item.id))
        const back = returned
          .filter((item) => !here.has(item.id))
          .map((item) => toDraftItem(item, typed.get(item.id)))
        if (back.length > 0) {
          setItems([...latest.items, ...back])
          onChanged(latest)
        }
        for (const id of typed.keys()) {
          if (survivors.has(id) && findItem(id)) saver.changed(itemKey(id))
        }
      }
      // An Item whose add got no answer may be stored, unchecked: it is deleted outright.
      for (const id of ids) {
        if (storedItems.has(id) || !unsureItems.has(id)) continue
        const deleted = await new Promise<boolean>((resolve) =>
          resolve(handlers.onDeleteItem(id)),
        ).catch(() => false)
        if (deleted) unsureItems.delete(id)
      }
    })
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
    onChanged(latest)
  }

  return {
    setHandlers(next: Handlers) {
      handlers = next
    },

    listen(listener: (draft: NoteDraft) => void) {
      onChanged = listener
    },

    receive,

    /** Takes a field's new text and saves it once typing pauses. */
    change(field: Field, value: string): NoteDraft {
      latest = { ...latest, fields: { ...latest.fields, [field]: value } }
      rolledBack.delete(field)
      saver.changed(field)
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
      rolledBack.delete(itemKey(id))
      saver.changed(itemKey(id))
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
      ticking.add(id)
      saver.run(itemKey(id), async () => {
        try {
          await addingItems.get(id)
          // An Item not stored yet is ticked once its add lands, retried or not.
          if (storedItems.has(id)) await tick(id, checked)
        } finally {
          ticking.delete(id)
        }
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
      const accepted = saver.run(itemKey(id), async () => {
        try {
          // An Item not stored yet takes its position with it when its add lands.
          await addingItems.get(id)
          if (!storedItems.has(id)) return
          const moved = await new Promise<StoredItem | null>((resolve) =>
            resolve(handlers.onUpdateItem(id, { position })),
          ).catch(() => null)
          if (moved) return
          if (findItem(id)?.position !== position) return
          patchItem(id, { position: before })
          onChanged(latest)
        } finally {
          const left = (moving.get(id) ?? 1) - 1
          if (left > 0) moving.set(id, left)
          else moving.delete(id)
        }
      })
      // Counted only once the move is taken, so one never sent holds nothing.
      if (accepted) moving.set(id, (moving.get(id) ?? 0) + 1)
      return latest
    },

    /** Deletes an Item at once. */
    deleteItem(id: string): NoteDraft {
      removeItem(id)
      return latest
    },

    /** Deletes every checked Item, keeping any the server says someone unticked first. */
    clearChecked(): NoteDraft {
      clearChecked()
      return latest
    },

    /** A field or an Item's text took focus: a load leaves it alone until it loses focus. */
    focus(key: SaveKey) {
      focused = key
    },

    /** A field lost focus: it takes what a load changed meanwhile, unless typing holds it. */
    blur(key: SaveKey): NoteDraft {
      if (focused === key) focused = null
      if (behind.has(key)) catchUp(key)
      return latest
    },

    /**
     * An Item lost focus: one left blank is dropped, and any other takes what a load changed
     * meanwhile, unless typing holds it.
     */
    blurItem(id: string): NoteDraft {
      const key = itemKey(id)
      if (focused === key) focused = null
      const item = findItem(id)
      if (item && isBlankItem(item)) removeItem(id)
      else if (behind.has(key)) catchUp(key)
      return latest
    },

    /** Tries every "Not saved" field and Item again, now. */
    retry() {
      saver.retry()
    },

    /**
     * Sends everything not yet saved at once, with keepalive: typing still pausing, "Not saved"
     * text and what is typed in the "Add item" row, which becomes an Item. Blank Items are
     * dropped.
     */
    flush() {
      takeAddRowAndDropBlanks()
      saver.flush()
    },

    /**
     * Saves everything not yet saved, now and in order (the page stays, so no keepalive), then
     * stops saving for good, as the viewer is Leaving the Note: nothing typed after is saved.
     * Resolves once every save on its way has settled, so none of them races the Leave.
     */
    saveAndStop(): Promise<void> {
      takeAddRowAndDropBlanks()
      return saver.finish()
    },

    /**
     * Stops saving for good, as the Note is being deleted: typing not yet saved is dropped and
     * no queued save runs. Resolves, once the saves on their way have settled, to whether the
     * Note may be on the server: a create that lands mid-delete is deleted too, and so is one
     * that got no answer, as it may have been stored all the same.
     */
    async discard(): Promise<boolean> {
      discarded = true
      await saver.stop()
      await creating
      return exists || unsureNote
    },
  }
}

/**
 * The editor's own copy of a Note, saved on its own. Each typed field, and each Item's text,
 * saves about a second after typing pauses, independently of the others; adding, ticking, moving
 * and deleting an Item save at once. A new Note is created by its first save with content, so one
 * left empty, or with only blank Items, is never stored; a saved Note stays even when emptied.
 * Text that can't reach the server keeps its place, is listed in `notSaved` and is retried.
 * Hiding or leaving the page, or unmounting, sends what is not yet saved at once; Leaving the
 * Note saves it, then stops.
 */
export function useNoteDraft({ loaded, saved, ...handlers }: NoteDraftOptions) {
  const [first] = useState(() => ({
    fields: loaded.fields,
    items: [...loaded.items],
    newItemText: "",
  }))
  const [draft, setDraft] = useState(first)
  const [notSaved, setNotSaved] = useState<ReadonlySet<SaveKey>>(() => new Set())
  const [autosave] = useState(() => createAutosave(first, saved, handlers, setNotSaved))

  // Later saves use the latest render's callbacks.
  useEffect(() => {
    autosave.setHandlers(handlers)
  })
  useEffect(() => {
    autosave.listen(setDraft)
    return () => autosave.listen(unheard)
  }, [autosave])
  // Each later load, such as a refetch on focus or reconnect, is taken in quietly.
  const { title, body } = loaded.fields
  const { items } = loaded
  useEffect(() => {
    autosave.receive({ fields: { title, body }, items })
  }, [autosave, title, body, items])
  useTypedTextLifecycle(autosave)

  return {
    draft,
    /** Whether a field's text, or an Item's, is "Not saved". */
    isNotSaved: (key: Field | { item: string }) =>
      notSaved.has(typeof key === "string" ? key : itemKey(key.item)),
    change: (field: Field, value: string) => setDraft(autosave.change(field, value)),
    typeNewItem: (text: string) => setDraft(autosave.typeNewItem(text)),
    addItem: () => setDraft(autosave.addItem(newId())),
    changeItem: (id: string, text: string) => setDraft(autosave.changeItem(id, text)),
    toggleItem: (id: string, checked: boolean) => setDraft(autosave.toggleItem(id, checked)),
    moveItem: (id: string, toIndex: number) => setDraft(autosave.moveItem(id, toIndex)),
    deleteItem: (id: string) => setDraft(autosave.deleteItem(id)),
    clearChecked: () => setDraft(autosave.clearChecked()),
    focusField: (field: Field) => autosave.focus(field),
    blurField: (field: Field) => setDraft(autosave.blur(field)),
    focusItem: (id: string) => autosave.focus(itemKey(id)),
    blurItem: (id: string) => setDraft(autosave.blurItem(id)),
    discard: () => autosave.discard(),
    saveAndStop: () => autosave.saveAndStop(),
  }
}

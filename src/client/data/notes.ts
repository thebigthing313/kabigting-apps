// The Notes App's client data: two eager collections, every Note and every Item the server shows
// the signed-in Account. Each refetch returns the complete visible set, so a Note or Item that
// stops being visible drops out without extra code; refetches follow the Shell's focus and
// reconnect defaults.
import { eq, useLiveQuery } from "@tanstack/react-db"
import { api, sendWrite } from "@/data/api"
import { defineRestCollection, type WriteOptions } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { settled, type WriteOutcome, writeOutcome } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import { bottomOfUnchecked } from "@shared/notes/items"
import { titleOrNull } from "@shared/notes/notes"
import type {
  ItemRow,
  ItemWrite,
  NoteKind,
  NotePerson,
  NoteRow,
  UpdateItem,
  UpdateNote,
} from "@shared/notes/schemas"

export type Note = NoteRow
export type Item = ItemRow

/** The typed parts of a Note, as its editor holds them. A Checklist's body stays empty. */
export type NoteFields = { title: string; body: string }

/** What an Item is made with; it starts unchecked. */
export type NewItem = { id: string; text: string; position: string }

/** A tick or untick of an Item, saved at once. Its text saves as typed text. */
export type ItemChanges = { checked?: boolean }

/** How a save of typed text is sent: with keepalive while the page is being left. */
export type SaveOptions = Pick<WriteOptions, "keepalive">

/**
 * How a save of typed text ended. "unreached" (no network, or a gateway failure) is shown by its
 * field as "Not saved" and tried again; a refusal is rolled back and reported.
 */
export type SaveOutcome = WriteOutcome

/** A save of typed text: a failure to reach the server shows as "Not saved", not as a toast. */
function typedText(options: SaveOptions): { metadata: WriteOptions } {
  return { metadata: { ...options, quietWhenUnreached: true } }
}

function editable(changes: Partial<NoteRow>): UpdateNote {
  const { title, body } = changes
  return {
    ...(title === undefined ? {} : { title }),
    ...(body === undefined || body === null ? {} : { body }),
  }
}

const notesCollection = defineRestCollection<NoteRow>({
  id: "notes-notes",
  queryKey: ["notes", "notes"],
  fetchRows: async () => (await readJson(await api.notes.notes.$get())).rows,
  create: async ({ id, kind, title, body }, options) => {
    const json =
      kind === "text"
        ? { id, kind, title, body: body ?? "" }
        : { id, kind: "checklist" as const, title }
    return readJson(await sendWrite(options, json, (init) => api.notes.notes.$post({ json }, init)))
  },
  update: async (id, changes, options) => {
    const json = editable(changes)
    return readJson(
      await sendWrite(options, json, (init) =>
        api.notes.notes[":id"].$patch({ param: { id }, json }, init),
      ),
    )
  },
  remove: async (id) => readJson(await api.notes.notes[":id"].$delete({ param: { id } })),
  // A Note deleted elsewhere, or no longer visible, leaves the list on the failed write.
  dropOnNotFound: true,
})

/**
 * Every Item write is an edit to its Checklist: first the Checklist takes the server's new
 * edited at, rising to the top of the list, then the Item as stored is returned.
 */
async function bumpNoteThenItem({ item, noteEditedAt }: ItemWrite): Promise<ItemRow> {
  const notes = notesCollection()
  if (notes.has(item.noteId))
    await notes.utils.writeUpdate({ id: item.noteId, editedAt: noteEditedAt })
  return item
}

function itemChanges(changes: Partial<ItemRow>): UpdateItem {
  const { text, checked } = changes
  return {
    ...(text === undefined ? {} : { text }),
    ...(checked === undefined ? {} : { checked }),
  }
}

const itemsCollection = defineRestCollection<ItemRow>({
  id: "notes-items",
  queryKey: ["notes", "items"],
  fetchRows: async () => (await readJson(await api.notes.items.$get())).rows,
  create: async ({ id, noteId, text }, options) => {
    const json = { id, noteId, text }
    return bumpNoteThenItem(
      await readJson(
        await sendWrite(options, json, (init) => api.notes.items.$post({ json }, init)),
      ),
    )
  },
  update: async (id, changes, options) => {
    const json = itemChanges(changes)
    return bumpNoteThenItem(
      await readJson(
        await sendWrite(options, json, (init) =>
          api.notes.items[":id"].$patch({ param: { id }, json }, init),
        ),
      ),
    )
  },
  remove: async (id) =>
    bumpNoteThenItem(await readJson(await api.notes.items[":id"].$delete({ param: { id } }))),
  // An Item deleted elsewhere, or whose Checklist is gone, drops out on the failed write.
  dropOnNotFound: true,
})

/** Every Note the signed-in Account can see, live, in no particular order. */
export function useNotes() {
  const notes = notesCollection()
  return useLiveQuery((q) => q.from({ note: notes }), [notes])
}

/** Every Item of every Checklist the signed-in Account can see, live, in no particular order. */
export function useItems() {
  const items = itemsCollection()
  return useLiveQuery((q) => q.from({ item: items }), [items])
}

/** One Note, live; `note` is undefined while loading or when there is no such Note. */
export function useNote(id: string) {
  const notes = notesCollection()
  const { data, isLoading } = useLiveQuery(
    (q) => q.from({ note: notes }).where(({ note }) => eq(note.id, id)),
    [notes, id],
  )
  return { note: data[0], isLoading }
}

/** One Checklist's Items, live, in no particular order. */
export function useNoteItems(noteId: string) {
  const items = itemsCollection()
  return useLiveQuery(
    (q) => q.from({ item: items }).where(({ item }) => eq(item.noteId, noteId)),
    [items, noteId],
  )
}

/**
 * Saves a Note that so far existed only on this device, as its typed text first saves. A refusal
 * is rolled back and reported; a save that never reached the server is retried by the editor.
 */
export function createNote(
  id: string,
  kind: NoteKind,
  creator: NotePerson,
  fields: NoteFields,
  options: SaveOptions,
): Promise<SaveOutcome> {
  const now = nowInstant()
  return writeOutcome(
    notesCollection().insert(
      {
        id,
        kind,
        title: titleOrNull(fields.title),
        body: kind === "text" ? fields.body : null,
        creator,
        createdAt: now,
        editedAt: now,
      },
      typedText(options),
    ),
  )
}

/** Writes only the typed fields given, each on its own; outcomes as for `createNote`. */
export function updateNote(
  id: string,
  changes: Partial<NoteFields>,
  options: SaveOptions,
): Promise<SaveOutcome> {
  return writeOutcome(
    notesCollection().update(id, typedText(options), (draft) => {
      if (changes.title !== undefined) draft.title = titleOrNull(changes.title)
      if (changes.body !== undefined) draft.body = changes.body
    }),
  )
}

/** Deletes a Note for good. True once the server deleted it. */
export function deleteNote(id: string) {
  return settled(notesCollection().delete(id))
}

/**
 * Adds an Item to the bottom of a saved Checklist's unchecked Items, as its typed text first
 * saves; the server has the last word on where. Outcomes as for `createNote`.
 */
export function addItem(
  noteId: string,
  { id, text, position }: NewItem,
  options: SaveOptions,
): Promise<SaveOutcome> {
  return writeOutcome(
    itemsCollection().insert(
      { id, noteId, text, checked: false, checkedAt: null, position },
      typedText(options),
    ),
  )
}

/** Writes an Item's typed text; outcomes as for `createNote`. */
export function updateItemText(
  id: string,
  text: string,
  options: SaveOptions,
): Promise<SaveOutcome> {
  return writeOutcome(
    itemsCollection().update(id, typedText(options), (draft) => {
      draft.text = text
    }),
  )
}

/**
 * Ticks or unticks an Item; its text saves through `updateItemText`. A tick shows at once and
 * the server stamps its own time; an untick returns the Item to the bottom of the unchecked
 * Items. Resolves to the Item as the server stored it, tick time included, or null after a
 * refusal (rolled back and reported).
 */
export async function updateItem(id: string, { checked }: ItemChanges): Promise<Item | null> {
  const items = itemsCollection()
  const stored = await settled(
    items.update(id, (draft) => {
      if (checked === true && !draft.checked) {
        draft.checked = true
        draft.checkedAt = nowInstant()
      } else if (checked === false && draft.checked) {
        const checklist = [...items.values()].filter((item) => item.noteId === draft.noteId)
        draft.checked = false
        draft.checkedAt = null
        draft.position = bottomOfUnchecked(checklist)
      }
    }),
  )
  return stored ? (items.get(id) ?? null) : null
}

/** Deletes one Item. True once the server deleted it. */
export function deleteItem(id: string) {
  return settled(itemsCollection().delete(id))
}

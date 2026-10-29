// The Notes App's client data: two eager collections, every Note and every Item the server shows
// the signed-in Account. Each refetch returns the complete visible set, so a Note or Item that
// stops being visible drops out without extra code; refetches follow the Shell's focus and
// reconnect defaults.
import { createOptimisticAction, eq, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { ApiRequestError, readJson, reportError } from "@/data/error-handler"
import { settled } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import { bottomOfUnchecked } from "@shared/notes/items"
import { titleOrNull } from "@shared/notes/notes"
import type {
  ClearedItems,
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

/** The parts of an Item its editor changes, each written on its own. */
export type ItemChanges = { text?: string; checked?: boolean }

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
  create: async ({ id, kind, title, body }) =>
    readJson(
      await api.notes.notes.$post({
        json: kind === "text" ? { id, kind, title, body: body ?? "" } : { id, kind, title },
      }),
    ),
  update: async (id, changes) =>
    readJson(await api.notes.notes[":id"].$patch({ param: { id }, json: editable(changes) })),
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
  create: async ({ id, noteId, text }) =>
    bumpNoteThenItem(await readJson(await api.notes.items.$post({ json: { id, noteId, text } }))),
  update: async (id, changes) =>
    bumpNoteThenItem(
      await readJson(
        await api.notes.items[":id"].$patch({ param: { id }, json: itemChanges(changes) }),
      ),
    ),
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
 * Saves a Note that so far existed only on this device. True once the server stored it; false
 * after a refusal, which is rolled back and reported.
 */
export function createNote(id: string, kind: NoteKind, creator: NotePerson, fields: NoteFields) {
  const now = nowInstant()
  return settled(
    notesCollection().insert({
      id,
      kind,
      title: titleOrNull(fields.title),
      body: kind === "text" ? fields.body : null,
      creator,
      createdAt: now,
      editedAt: now,
    }),
  )
}

/** Writes only the fields given, each on its own. True once the server stored them. */
export function updateNote(id: string, changes: Partial<NoteFields>) {
  return settled(
    notesCollection().update(id, (draft) => {
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
 * Adds an Item to the bottom of a saved Checklist's unchecked Items; the server has the last word
 * on where. True once stored.
 */
export function addItem(noteId: string, { id, text, position }: NewItem) {
  return settled(
    itemsCollection().insert({ id, noteId, text, checked: false, checkedAt: null, position }),
  )
}

/**
 * Writes only the parts given. A tick shows at once and the server stamps its own time; an
 * untick returns the Item to the bottom of the unchecked Items. Resolves to the Item as the
 * server stored it, tick time included, or null after a refusal (rolled back and reported).
 */
export async function updateItem(id: string, changes: ItemChanges): Promise<Item | null> {
  const items = itemsCollection()
  const stored = await settled(
    items.update(id, (draft) => {
      if (changes.text !== undefined) draft.text = changes.text
      if (changes.checked === true && !draft.checked) {
        draft.checked = true
        draft.checkedAt = nowInstant()
      } else if (changes.checked === false && draft.checked) {
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

/** Drops rows the server says are gone; one a refetch already dropped is skipped. */
async function dropItems(ids: Iterable<string>) {
  const items = itemsCollection()
  for (const id of ids) {
    try {
      await items.utils.writeDelete(id)
    } catch {
      // Already gone.
    }
  }
}

type ClearRequest = { noteId: string; itemIds: string[]; answer: { kept: Item[] | null } }

/**
 * Clear checked, optimistically: the Items go at once, and a refusal brings them back with a
 * toast. The server deletes only those still checked; any it kept, as someone unticked them
 * first, return as stored, and the Checklist takes the server's edited at. A Checklist that is
 * gone leaves the list with its Items.
 */
const clearCheckedAction = createOptimisticAction<ClearRequest>({
  onMutate: ({ itemIds }) => {
    const items = itemsCollection()
    items.delete(itemIds.filter((id) => items.has(id)))
  },
  mutationFn: async ({ noteId, itemIds, answer }) => {
    const items = itemsCollection()
    const notes = notesCollection()
    let result: ClearedItems
    try {
      result = await readJson(
        await api.notes.notes[":id"]["clear-checked"].$post({
          param: { id: noteId },
          json: { itemIds },
        }),
      )
    } catch (error) {
      reportError(error, "Clearing")
      if (error instanceof ApiRequestError && error.status === 404) {
        const ofNote = [...items.values()].filter((item) => item.noteId === noteId)
        await dropItems(new Set([...itemIds, ...ofNote.map((item) => item.id)]))
        if (notes.has(noteId)) await notes.utils.writeDelete(noteId)
      }
      throw error
    }
    await dropItems(result.cleared)
    if (result.kept.length > 0) await items.utils.writeUpsert(result.kept)
    if (notes.has(noteId)) {
      await notes.utils.writeUpdate({ id: noteId, editedAt: result.noteEditedAt })
    }
    answer.kept = result.kept
  },
})

/**
 * Deletes the Items given, those seen checked in one Checklist, that are still checked on the
 * server. Resolves to the Items it kept, or null after a refusal (rolled back and reported).
 */
export async function clearChecked(
  noteId: string,
  itemIds: string[],
): Promise<{ kept: Item[] } | null> {
  const answer: ClearRequest["answer"] = { kept: null }
  const stored = await settled(clearCheckedAction({ noteId, itemIds, answer }))
  return stored && answer.kept !== null ? { kept: answer.kept } : null
}

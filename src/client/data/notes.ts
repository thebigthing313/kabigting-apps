// The Notes App's client data: two eager collections, every Note and every Item the server shows
// the signed-in Account. Each refetch returns the complete visible set, so a Note or Item that
// stops being visible (a member removed from its Audience, say) drops out silently; refetches
// follow the Shell's focus and reconnect defaults.
import { createOptimisticAction, eq, useLiveQuery } from "@tanstack/react-db"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { ApiRequestError, readJson, reportError } from "@/data/error-handler"
import { settled } from "@/data/settled"
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

/** The parts of an Item its editor changes, each written on its own. */
export type ItemChanges = { text?: string; checked?: boolean; position?: string }

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
  // Only typed fields go through here; the Audience has its own action, `shareNote`.
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
  const { text, checked, position } = changes
  return {
    ...(text === undefined ? {} : { text }),
    ...(checked === undefined ? {} : { checked }),
    ...(position === undefined ? {} : { position }),
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
      // A new Note is private until its Creator shares it.
      audience: [],
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
 * untick returns the Item to the bottom of the unchecked Items; a position moves it among them.
 * Resolves to the Item as the server stored it, tick time included, or null after a refusal
 * (rolled back and reported).
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
      if (changes.position !== undefined) draft.position = changes.position
    }),
  )
  return stored ? (items.get(id) ?? null) : null
}

/** Deletes one Item. True once the server deleted it. */
export function deleteItem(id: string) {
  return settled(itemsCollection().delete(id))
}

/**
 * Replacing the Audience: its own route, not a field write, so it is an action of its own. The
 * new Audience shows at once; a refusal rolls it back with a toast, and a Note that is gone (404)
 * leaves the list.
 */
const replaceAudience = createOptimisticAction<{ id: string; audience: readonly NotePerson[] }>({
  onMutate: ({ id, audience }) => {
    notesCollection().update(id, (draft) => {
      draft.audience = [...audience]
    })
  },
  mutationFn: async ({ id, audience }) => {
    const notes = notesCollection()
    try {
      const accountIds = audience.map((person) => person.id)
      const row = await readJson(
        await api.notes.notes[":id"].audience.$put({ param: { id }, json: { accountIds } }),
      )
      await notes.utils.writeUpsert(row)
    } catch (error) {
      reportError(error, "Sharing")
      if (error instanceof ApiRequestError && error.status === 404)
        await notes.utils.writeDelete(id)
      throw error
    }
  },
})

/**
 * Replaces who a Note is shared with (Creator only). True once the server stored it; false after
 * a refusal, which is rolled back and reported.
 */
export function shareNote(id: string, audience: readonly NotePerson[]) {
  return settled(replaceAudience({ id, audience }))
}

/**
 * The Accounts the Creator can add to an Audience: everyone else holding App access to Notes.
 * Fetched only while `enabled`.
 */
export function useNotePeople(enabled: boolean) {
  return useQuery({
    queryKey: ["notes", "people"],
    queryFn: async () => (await readJson(await api.notes.people.$get())).rows,
    enabled,
  })
}

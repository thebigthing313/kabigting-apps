// The Notes App's client data: one eager collection of every Note the server shows the signed-in
// Account. Each refetch returns the complete visible set, so a Note that stops being visible
// drops out without extra code; refetches follow the Shell's focus and reconnect defaults.
import { eq, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { settled } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import { titleOrNull } from "@shared/notes/notes"
import type { NotePerson, NoteRow, UpdateNote } from "@shared/notes/schemas"

export type Note = NoteRow

/** The typed parts of a Note, as its editor holds them. */
export type NoteFields = { title: string; body: string }

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
  create: async ({ id, kind, title, body }) => {
    if (kind !== "text") throw new Error("Only Text notes can be made")
    return readJson(await api.notes.notes.$post({ json: { id, kind, title, body: body ?? "" } }))
  },
  update: async (id, changes) =>
    readJson(await api.notes.notes[":id"].$patch({ param: { id }, json: editable(changes) })),
  remove: async (id) => readJson(await api.notes.notes[":id"].$delete({ param: { id } })),
  // A Note deleted elsewhere, or no longer visible, leaves the list on the failed write.
  dropOnNotFound: true,
})

/** Every Note the signed-in Account can see, live, in no particular order. */
export function useNotes() {
  const notes = notesCollection()
  return useLiveQuery((q) => q.from({ note: notes }), [notes])
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

/**
 * Saves a Note that so far existed only on this device. True once the server stored it; false
 * after a refusal, which is rolled back and reported.
 */
export function createTextNote(id: string, creator: NotePerson, fields: NoteFields) {
  const now = nowInstant()
  return settled(
    notesCollection().insert({
      id,
      kind: "text",
      title: titleOrNull(fields.title),
      body: fields.body,
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

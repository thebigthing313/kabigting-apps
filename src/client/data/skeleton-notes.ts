import { useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { nowInstant } from "@shared/dates"
import { newId } from "@shared/ids"
import type { NoteRow, UpdateNote } from "@shared/schemas/skeleton"

export type Note = NoteRow
export type NoteInput = { text: string; amountCents: number; onDate: string }

function editable(changes: Partial<NoteRow>): UpdateNote {
  const { text, amountCents, onDate } = changes
  return {
    ...(text === undefined ? {} : { text }),
    ...(amountCents === undefined ? {} : { amountCents }),
    ...(onDate === undefined ? {} : { onDate }),
  }
}

const skeletonNotes = defineRestCollection<NoteRow>({
  id: "skeleton-notes",
  queryKey: ["skeleton", "notes"],
  fetchRows: async () => (await readJson(await api.skeleton.notes.query.$post({ json: {} }))).rows,
  create: async ({ id, text, amountCents, onDate }) =>
    readJson(await api.skeleton.notes.$post({ json: { id, text, amountCents, onDate } })),
  update: async (id, changes) =>
    readJson(await api.skeleton.notes[":id"].$patch({ param: { id }, json: editable(changes) })),
  remove: async (id) => readJson(await api.skeleton.notes[":id"].$delete({ param: { id } })),
})

/** The signed-in Account's notes, newest date first, live. */
export function useNotes() {
  const notes = skeletonNotes()
  return useLiveQuery(
    (q) =>
      q
        .from({ note: notes })
        .orderBy(({ note }) => note.onDate, "desc")
        .orderBy(({ note }) => note.createdAt, "desc"),
    [notes],
  )
}

/** True once the server accepted the write; false after a rollback (already reported). */
async function settled(transaction: { when: (state: "settled") => Promise<unknown> }) {
  try {
    await transaction.when("settled")
    return true
  } catch {
    return false
  }
}

/** Shows the note at once; rolls it back with a toast if the server refuses it. */
export function addNote(input: NoteInput): Promise<boolean> {
  const now = nowInstant()
  return settled(skeletonNotes().insert({ id: newId(), ...input, createdAt: now, updatedAt: now }))
}

export function editNote(id: string, changes: Partial<NoteInput>): Promise<boolean> {
  return settled(
    skeletonNotes().update(id, (draft) => {
      Object.assign(draft, changes)
    }),
  )
}

export function deleteNote(id: string): Promise<boolean> {
  return settled(skeletonNotes().delete(id))
}

/**
 * The Notes App's pure rules, shared by the server and the client: how Notes are ordered, how a
 * row previews a Note, and when a Note counts as empty.
 */

/** The parts of a Note that hold what was typed. A Checklist has no body. */
export type NoteContent = { title: string | null; body: string | null }

/** What a Notes row shows: a heading, and the start of the rest on one line. */
export type NotePreview = { heading: string; snippet: string }

const SNIPPET_LENGTH = 160

function isBlank(text: string | null): boolean {
  return text === null || text.trim() === ""
}

/** Runs of whitespace, line breaks included, as one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

function cut(text: string): string {
  return text.length > SNIPPET_LENGTH ? `${text.slice(0, SNIPPET_LENGTH - 1).trimEnd()}…` : text
}

/**
 * The Notes list order: the newest edit first. Ties go to the newer id (ids are UUIDv7, so they
 * sort by creation). Returns a new array.
 */
export function orderNotes<Note extends { id: string; editedAt: string }>(
  notes: readonly Note[],
): Note[] {
  return notes.toSorted(
    (a, b) =>
      Date.parse(b.editedAt) - Date.parse(a.editedAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  )
}

/**
 * The title, or for an untitled Note its first line of text, with the start of what follows as
 * the snippet. A Note with nothing in it reads as "Untitled".
 */
export function notePreview(note: NoteContent): NotePreview {
  const body = note.body ?? ""
  if (!isBlank(note.title)) {
    return { heading: oneLine(note.title ?? ""), snippet: cut(oneLine(body)) }
  }
  const lines = body.split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  if (first === -1) return { heading: "Untitled", snippet: "" }
  return {
    heading: oneLine(lines[first] ?? ""),
    snippet: cut(oneLine(lines.slice(first + 1).join("\n"))),
  }
}

/** A Note with no title and nothing but whitespace in its body is empty. */
export function isEmptyNote(note: NoteContent): boolean {
  return isBlank(note.title) && isBlank(note.body)
}

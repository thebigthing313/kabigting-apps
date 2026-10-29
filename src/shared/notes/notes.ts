/**
 * The Notes App's pure rules, shared by the server and the client: how Notes are ordered, how a
 * row previews a Note, who it reads as shared with, and when a Note counts as empty.
 */
import { orderItems, type ItemPlacing } from "./items.ts"

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
 * the snippet. A Checklist's text is its unchecked Items, in order. A Note with nothing in it
 * reads as "Untitled".
 */
export function notePreview(
  note: NoteContent,
  items: readonly (ItemPlacing & { text: string })[] = [],
): NotePreview {
  if (note.body === null) return checklistPreview(note.title, items)
  const body = note.body
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

function checklistPreview(
  title: string | null,
  items: readonly (ItemPlacing & { text: string })[],
): NotePreview {
  const unchecked = orderItems(items)
    .unchecked.map((item) => oneLine(item.text))
    .filter((text) => text !== "")
  if (!isBlank(title)) return { heading: oneLine(title ?? ""), snippet: cut(unchecked.join(", ")) }
  const [first, ...rest] = unchecked
  return { heading: first ?? "Untitled", snippet: cut(rest.join(", ")) }
}

/** A title as stored: an empty one means none. Anything else is kept exactly as typed. */
export function titleOrNull(title: string | null | undefined): string | null {
  return title ? title : null
}

/**
 * A Note with no title, nothing but whitespace in its body and only blank Items, if any, is
 * empty.
 */
export function isEmptyNote(note: NoteContent, items: readonly { text: string }[] = []): boolean {
  return isBlank(note.title) && isBlank(note.body) && items.every((item) => isBlank(item.text))
}

/** A blank Item, nothing but whitespace, is dropped rather than kept. */
export function isBlankItem(item: { text: string }): boolean {
  return isBlank(item.text)
}

/** Who can see a Note: its Creator and its Audience. */
export type NoteSharing = {
  creator: { id: string; name: string }
  audience: readonly { id: string; name: string }[]
}

/**
 * Who a Note is shared with, as one short line from the viewer's side: "Only you", "Shared with …"
 * naming its Audience, or "Shared by …" naming its Creator.
 */
export function sharingLine(note: NoteSharing, viewerId: string): string {
  if (note.creator.id !== viewerId) return `Shared by ${note.creator.name}`
  if (note.audience.length === 0) return "Only you"
  return `Shared with ${note.audience.map((person) => person.name).join(", ")}`
}

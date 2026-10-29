// PROTOTYPE, throwaway: an in-memory stand-in for the Notes data layer, for the UI prototype only.
// Nothing here talks to the server; reloading the page resets every Note.
import { useState } from "react"

export type Account = { id: string; name: string }
export type Item = {
  id: string
  text: string
  checked: boolean
  /** Order among the unchecked Items. */
  position: number
  /** When it was checked; checked Items show most recent first. */
  checkedAt: number | null
}
export type Note = {
  id: string
  kind: "text" | "checklist"
  title: string
  body: string
  items: Item[]
  creatorId: string
  audience: string[]
  updatedAt: number
}

export const ACCOUNTS: Account[] = [
  { id: "sam", name: "Sam" },
  { id: "alex", name: "Alex" },
  { id: "jordan", name: "Jordan" },
  { id: "riley", name: "Riley" },
]

export function accountName(id: string): string {
  return ACCOUNTS.find((account) => account.id === id)?.name ?? id
}

let nextId = 100
const newId = () => String(nextId++)
const minutesAgo = (minutes: number) => Date.now() - minutes * 60_000

function items(lines: Array<string | [string, true]>): Item[] {
  return lines.map((line, index) => {
    const checked = Array.isArray(line)
    return {
      id: newId(),
      text: checked ? line[0] : line,
      checked,
      position: index,
      checkedAt: checked ? minutesAgo(index) : null,
    }
  })
}

const SEED: Note[] = [
  {
    id: "1",
    kind: "checklist",
    title: "Groceries",
    body: "",
    items: items(["Milk", "Eggs", "Rice, 25 lb", ["Bananas", true], "Dish soap", ["Bread", true]]),
    creatorId: "sam",
    audience: ["alex", "jordan"],
    updatedAt: minutesAgo(5),
  },
  {
    id: "2",
    kind: "text",
    title: "Wi-Fi for guests",
    body: "Network: house-guest\nPassword: correct-horse-battery\n\nRouter is in the hall closet.",
    items: [],
    creatorId: "alex",
    audience: ["sam", "jordan", "riley"],
    updatedAt: minutesAgo(60 * 26),
  },
  {
    id: "3",
    kind: "text",
    title: "",
    body: "Ask the landlord about the back gutter before the rain on Friday.",
    items: [],
    creatorId: "sam",
    audience: [],
    updatedAt: minutesAgo(90),
  },
  {
    id: "4",
    kind: "checklist",
    title: "Trip packing",
    body: "",
    items: items(["Passports", "Chargers", ["Sunscreen", true], "Snacks for the drive"]),
    creatorId: "jordan",
    audience: ["sam"],
    updatedAt: minutesAgo(60 * 50),
  },
  {
    id: "5",
    kind: "text",
    title: "Gift ideas",
    body: "Riley: the blue headphones\nAlex: a cast-iron pan",
    items: [],
    creatorId: "sam",
    audience: ["jordan"],
    updatedAt: minutesAgo(60 * 24 * 6),
  },
  {
    id: "6",
    kind: "checklist",
    title: "Chores this week",
    body: "",
    items: items(["Vacuum upstairs", "Take out recycling", ["Water the plants", true]]),
    creatorId: "riley",
    audience: ["sam", "alex", "jordan"],
    updatedAt: minutesAgo(60 * 3),
  },
]

/** Unchecked Items in their order, then checked Items, most recently checked first. */
export function orderedItems(note: Note): { unchecked: Item[]; checked: Item[] } {
  return {
    unchecked: note.items
      .filter((item) => !item.checked)
      .toSorted((a, b) => a.position - b.position),
    checked: note.items
      .filter((item) => item.checked)
      .toSorted((a, b) => (b.checkedAt ?? 0) - (a.checkedAt ?? 0)),
  }
}

export function relativeTime(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? "yesterday" : `${days} days ago`
}

/** Who a Note is shared with, as one short line from the viewer's side. */
export function sharingLine(note: Note, viewerId: string): string {
  if (note.creatorId !== viewerId) return `Shared by ${accountName(note.creatorId)}`
  if (note.audience.length === 0) return "Only you"
  return `Shared with ${note.audience.map(accountName).join(", ")}`
}

export function useNotesStore(viewerId: string) {
  const [notes, setNotes] = useState<Note[]>(SEED)

  const change = (id: string, update: (note: Note) => Note) =>
    setNotes((all) =>
      all.map((note) => (note.id === id ? { ...update(note), updatedAt: Date.now() } : note)),
    )
  const changeItems = (id: string, update: (items: Item[]) => Item[]) =>
    change(id, (note) => ({ ...note, items: update(note.items) }))

  const visible = notes
    .filter((note) => note.creatorId === viewerId || note.audience.includes(viewerId))
    .toSorted((a, b) => b.updatedAt - a.updatedAt)

  return {
    notes: visible,
    viewerId,
    find: (id: string | undefined) => visible.find((note) => note.id === id),
    create(kind: Note["kind"]): string {
      const id = newId()
      setNotes((all) => [
        {
          id,
          kind,
          title: "",
          body: "",
          items: [],
          creatorId: viewerId,
          audience: [],
          updatedAt: Date.now(),
        },
        ...all,
      ])
      return id
    },
    /** Empty new Notes are discarded rather than kept. */
    discardIfEmpty(id: string) {
      setNotes((all) =>
        all.filter(
          (note) =>
            note.id !== id ||
            note.title.trim() !== "" ||
            note.body.trim() !== "" ||
            note.items.length > 0,
        ),
      )
    },
    setTitle: (id: string, title: string) => change(id, (note) => ({ ...note, title })),
    setBody: (id: string, body: string) => change(id, (note) => ({ ...note, body })),
    setAudience: (id: string, audience: string[]) => change(id, (note) => ({ ...note, audience })),
    leave: (id: string) =>
      change(id, (note) => ({ ...note, audience: note.audience.filter((a) => a !== viewerId) })),
    remove: (id: string) => setNotes((all) => all.filter((note) => note.id !== id)),
    addItem(id: string, text: string) {
      changeItems(id, (list) => [
        ...list,
        {
          id: newId(),
          text,
          checked: false,
          position: Math.max(-1, ...list.map((item) => item.position)) + 1,
          checkedAt: null,
        },
      ])
    },
    setItemText: (id: string, itemId: string, text: string) =>
      changeItems(id, (list) =>
        list.map((item) => (item.id === itemId ? { ...item, text } : item)),
      ),
    toggleItem(id: string, itemId: string) {
      changeItems(id, (list) => {
        const bottom = Math.max(-1, ...list.map((item) => item.position)) + 1
        return list.map((item) =>
          item.id !== itemId
            ? item
            : item.checked
              ? { ...item, checked: false, checkedAt: null, position: bottom }
              : { ...item, checked: true, checkedAt: Date.now() },
        )
      })
    },
    deleteItem: (id: string, itemId: string) =>
      changeItems(id, (list) => list.filter((item) => item.id !== itemId)),
    clearChecked: (id: string) => changeItems(id, (list) => list.filter((item) => !item.checked)),
    /** Moves an unchecked Item to `toIndex` among the unchecked Items. */
    moveItem(id: string, itemId: string, toIndex: number) {
      changeItems(id, (list) => {
        const unchecked = list
          .filter((item) => !item.checked)
          .toSorted((a, b) => a.position - b.position)
        const from = unchecked.findIndex((item) => item.id === itemId)
        if (from < 0) return list
        const [moved] = unchecked.splice(from, 1)
        unchecked.splice(Math.max(0, Math.min(toIndex, unchecked.length)), 0, moved!)
        const positions = new Map(unchecked.map((item, index) => [item.id, index]))
        return list.map((item) =>
          positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item,
        )
      })
    },
  }
}

export type NotesStore = ReturnType<typeof useNotesStore>

import { describe, expect, test } from "vitest"
import { isEmptyNote, notePreview, orderNotes, sharingLine, titleOrNull } from "./notes.ts"

describe("orderNotes", () => {
  test("puts the newest edit first", () => {
    const notes = [
      { id: "a", editedAt: "2026-10-01T09:00:00.000Z" },
      { id: "b", editedAt: "2026-10-03T09:00:00.000Z" },
      { id: "c", editedAt: "2026-10-02T09:00:00.000Z" },
    ]
    expect(orderNotes(notes).map((note) => note.id)).toEqual(["b", "c", "a"])
  })

  test("compares instants, not their spelling", () => {
    const notes = [
      { id: "earlier", editedAt: "2026-10-01T09:00:00Z" },
      { id: "later", editedAt: "2026-10-01T09:00:00.500Z" },
    ]
    expect(orderNotes(notes).map((note) => note.id)).toEqual(["later", "earlier"])
  })

  test("breaks a tie by the newer id, and leaves its input alone", () => {
    const at = "2026-10-01T09:00:00.000Z"
    const notes = [
      { id: "0190a000-0000-7000-8000-000000000001", editedAt: at },
      { id: "0190a000-0000-7000-8000-000000000002", editedAt: at },
    ]
    expect(orderNotes(notes).map((note) => note.id.slice(-1))).toEqual(["2", "1"])
    expect(notes[0]!.id.slice(-1)).toBe("1")
  })

  test("puts Unopened Notes above all others, each group newest edit first", () => {
    const notes = [
      { id: "opened-new", unopened: false, editedAt: "2026-10-05T09:00:00.000Z" },
      { id: "unopened-old", unopened: true, editedAt: "2026-10-01T09:00:00.000Z" },
      { id: "opened-old", unopened: false, editedAt: "2026-10-02T09:00:00.000Z" },
      { id: "unopened-new", unopened: true, editedAt: "2026-10-03T09:00:00.000Z" },
    ]
    expect(orderNotes(notes).map((note) => note.id)).toEqual([
      "unopened-new",
      "unopened-old",
      "opened-new",
      "opened-old",
    ])
  })
})

describe("notePreview", () => {
  test("a titled Note shows its title, then the start of its body on one line", () => {
    expect(
      notePreview({ title: "Wi-Fi", body: "Network: Guest\n  Password: made-up-123" }),
    ).toEqual({ heading: "Wi-Fi", snippet: "Network: Guest Password: made-up-123" })
  })

  test("an untitled Note shows its first line as the heading and the rest as the snippet", () => {
    expect(notePreview({ title: null, body: "\n  Call the plumber \nabout the sink\n" })).toEqual({
      heading: "Call the plumber",
      snippet: "about the sink",
    })
  })

  test("a blank title counts as no title", () => {
    expect(notePreview({ title: "   ", body: "Pick up dry cleaning" })).toEqual({
      heading: "Pick up dry cleaning",
      snippet: "",
    })
  })

  test("a Note with nothing in it reads as Untitled", () => {
    expect(notePreview({ title: null, body: "" })).toEqual({ heading: "Untitled", snippet: "" })
  })

  test("a Checklist shows its unchecked Items in order, under its title or as its heading", () => {
    const items = [
      { id: "1", text: "Eggs", position: "s", checked: false, checkedAt: null },
      { id: "2", text: "Milk", position: "c", checked: false, checkedAt: null },
      { id: "3", text: "Jam", position: "a", checked: true, checkedAt: "2026-10-01T09:00:00.000Z" },
      { id: "4", text: "Bread", position: "i", checked: false, checkedAt: null },
    ]
    expect(notePreview({ title: "Shop", body: null }, items)).toEqual({
      heading: "Shop",
      snippet: "Milk, Bread, Eggs",
    })
    expect(notePreview({ title: null, body: null }, items)).toEqual({
      heading: "Milk",
      snippet: "Bread, Eggs",
    })
  })

  test("a Checklist with nothing left to do reads as its title, or Untitled", () => {
    const done = [
      { id: "1", text: "Jam", position: "a", checked: true, checkedAt: "2026-10-01T09:00:00.000Z" },
    ]
    expect(notePreview({ title: "Shop", body: null }, done)).toEqual({
      heading: "Shop",
      snippet: "",
    })
    expect(notePreview({ title: null, body: null }, done)).toEqual({
      heading: "Untitled",
      snippet: "",
    })
  })

  test("a long snippet is cut short", () => {
    const { snippet } = notePreview({ title: "Long", body: "word ".repeat(200) })
    expect(snippet.length).toBeLessThanOrEqual(160)
    expect(snippet.startsWith("word word")).toBe(true)
  })
})

describe("isEmptyNote", () => {
  test("no title and an empty body is empty", () => {
    expect(isEmptyNote({ title: null, body: "" })).toBe(true)
    expect(isEmptyNote({ title: "", body: null })).toBe(true)
  })

  test("whitespace alone is still empty", () => {
    expect(isEmptyNote({ title: "  ", body: "\n\t \n" })).toBe(true)
  })

  test("a Checklist with only blank Items is empty; one Item with text is content", () => {
    expect(isEmptyNote({ title: null, body: null }, [{ text: "" }, { text: "  " }])).toBe(true)
    expect(isEmptyNote({ title: null, body: null }, [{ text: "" }, { text: "Milk" }])).toBe(false)
  })

  test("a title or any body text is content", () => {
    expect(isEmptyNote({ title: "Packing", body: "" })).toBe(false)
    expect(isEmptyNote({ title: null, body: "x" })).toBe(false)
  })
})

describe("titleOrNull", () => {
  test("an empty title is no title", () => {
    expect(titleOrNull("")).toBeNull()
    expect(titleOrNull(null)).toBeNull()
    expect(titleOrNull(undefined)).toBeNull()
  })

  test("any other title is kept exactly, spaces included", () => {
    expect(titleOrNull(" Groceries ")).toBe(" Groceries ")
    expect(titleOrNull(" ")).toBe(" ")
  })
})

describe("sharingLine", () => {
  const ana = { id: "ana", name: "Ana" }
  const ben = { id: "ben", name: "Ben" }
  const cy = { id: "cy", name: "Cy" }

  test("a Note the viewer made and shared with nobody is theirs alone", () => {
    expect(sharingLine({ creator: ana, audience: [] }, "ana")).toBe("Only you")
  })

  test("a Note the viewer made and shared names its Audience", () => {
    expect(sharingLine({ creator: ana, audience: [ben] }, "ana")).toBe("Shared with Ben")
    expect(sharingLine({ creator: ana, audience: [ben, cy] }, "ana")).toBe("Shared with Ben, Cy")
  })

  test("a Note someone else made names its Creator", () => {
    expect(sharingLine({ creator: ana, audience: [ben, cy] }, "ben")).toBe("Shared by Ana")
  })
})

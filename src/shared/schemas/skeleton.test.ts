import { describe, expect, test } from "vitest"
import { newId } from "../ids.ts"
import { createNote, noteRow, updateNote } from "./skeleton.ts"

const valid = { id: newId(), text: "Groceries", amountCents: -4520, onDate: "2026-10-14" }

describe("createNote", () => {
  test("accepts a note with a client-made id", () => {
    expect(createNote.parse(valid)).toEqual(valid)
  })

  test("trims the text and rejects blank text", () => {
    expect(createNote.parse({ ...valid, text: "  Rent  " }).text).toBe("Rent")
    expect(createNote.safeParse({ ...valid, text: "   " }).success).toBe(false)
  })

  test("rejects text over 500 characters", () => {
    expect(createNote.safeParse({ ...valid, text: "x".repeat(501) }).success).toBe(false)
  })

  test("rejects fractional amounts and unknown keys", () => {
    expect(createNote.safeParse({ ...valid, amountCents: 1.5 }).success).toBe(false)
    expect(createNote.safeParse({ ...valid, userId: "someone" }).success).toBe(false)
  })

  test.each(["id", "text", "amountCents", "onDate"] as const)("requires %s", (key) => {
    const { [key]: _, ...rest } = valid
    expect(createNote.safeParse(rest).success).toBe(false)
  })
})

describe("updateNote", () => {
  test("accepts any subset of the editable fields", () => {
    expect(updateNote.parse({ amountCents: 100 })).toEqual({ amountCents: 100 })
  })

  test("rejects an empty update and the id", () => {
    expect(updateNote.safeParse({}).success).toBe(false)
    expect(updateNote.safeParse({ id: newId() }).success).toBe(false)
  })
})

test("noteRow carries timestamps as UTC instants", () => {
  const row = {
    ...valid,
    createdAt: "2026-10-14T13:05:00.000Z",
    updatedAt: "2026-10-14T13:05:00.000Z",
  }
  expect(noteRow.parse(row)).toEqual(row)
  expect(noteRow.safeParse({ ...row, createdAt: "yesterday" }).success).toBe(false)
})

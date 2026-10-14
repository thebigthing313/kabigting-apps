import { expect, test } from "vitest"
import { newId } from "./ids.ts"

test("makes UUIDv7 ids", () => {
  expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test("ids made later sort after earlier ones", () => {
  const ids = Array.from({ length: 1000 }, () => newId())
  expect(ids.toSorted()).toEqual(ids)
  expect(new Set(ids).size).toBe(ids.length)
})

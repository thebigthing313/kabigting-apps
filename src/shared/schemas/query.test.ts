import { describe, expect, test } from "vitest"
import { z } from "zod"
import { newId } from "../ids.ts"
import { queryBody, rowsResponse } from "./query.ts"

const ids = (n: number) => Array.from({ length: n }, () => newId())

describe("queryBody", () => {
  const plain = queryBody({})

  test("accepts an empty body", () => {
    expect(plain.parse({})).toEqual({})
  })

  test("caps ids at 5000", () => {
    expect(plain.safeParse({ ids: ids(5000) }).success).toBe(true)
    expect(plain.safeParse({ ids: ids(5001) }).success).toBe(false)
  })

  test("rejects unknown keys", () => {
    expect(plain.safeParse({ idz: [] }).success).toBe(false)
  })

  test("takes per-resource filters alongside the base fields", () => {
    const withFilter = queryBody({ onDate: z.iso.date().optional() })
    expect(withFilter.parse({ onDate: "2026-10-14", limit: 10 })).toEqual({
      onDate: "2026-10-14",
      limit: 10,
    })
    expect(withFilter.safeParse({ onDate: 5 }).success).toBe(false)
  })

  test("rejects a limit outside 1..5000", () => {
    expect(plain.safeParse({ limit: 0 }).success).toBe(false)
    expect(plain.safeParse({ limit: 5001 }).success).toBe(false)
  })
})

test("rowsResponse wraps rows", () => {
  const schema = rowsResponse(z.object({ n: z.int() }))
  expect(schema.parse({ rows: [{ n: 1 }] })).toEqual({ rows: [{ n: 1 }] })
})

import { describe, expect, test } from "vitest"
import { cents, id, instant, isoDate } from "./primitives.ts"

describe("cents", () => {
  test.each([0, -125050, Number.MAX_SAFE_INTEGER])("accepts %i", (value) => {
    expect(cents.safeParse(value).success).toBe(true)
  })
  test.each([1.5, Number.MAX_SAFE_INTEGER + 1, "100", Number.NaN])("rejects %j", (value) => {
    expect(cents.safeParse(value).success).toBe(false)
  })
})

describe("isoDate", () => {
  test.each(["2026-10-14", "2028-02-29"])("accepts %s", (value) => {
    expect(isoDate.safeParse(value).success).toBe(true)
  })
  test.each(["2026-02-29", "2026-13-01", "2026-1-5", "2026-10-14T00:00:00Z", "10/14/2026"])(
    "rejects %s",
    (value) => {
      expect(isoDate.safeParse(value).success).toBe(false)
    },
  )
})

describe("instant", () => {
  test("accepts ISO-8601 UTC", () => {
    expect(instant.safeParse("2026-10-14T13:05:00.000Z").success).toBe(true)
  })
  test.each(["2026-10-14T09:05:00-04:00", "2026-10-14", "2026-10-14T13:05:00"])(
    "rejects %s",
    (value) => {
      expect(instant.safeParse(value).success).toBe(false)
    },
  )
})

describe("id", () => {
  test("accepts a UUID", () => {
    expect(id.safeParse("01920a3c-5b7e-7c3d-9f00-1a2b3c4d5e6f").success).toBe(true)
  })
  test.each(["not-a-uuid", "", "01920a3c5b7e7c3d9f001a2b3c4d5e6f"])("rejects %j", (value) => {
    expect(id.safeParse(value).success).toBe(false)
  })
})

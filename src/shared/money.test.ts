import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { allocate, format, parse, roundHalfUp } from "./money.ts"

describe("parse", () => {
  test("reads typed decimals with thousands separators as cents", () => {
    expect(parse("1,250.50")).toBe(125050)
  })

  test.each(["1.234", "0.001", "12.5.0"])("rejects more than two decimals: %s", (input) => {
    expect(parse(input)).toBeNull()
  })

  test.each(["", "  ", "abc", "1,25", "12a", "1e3", "--5", "$", "0x10"])(
    "rejects malformed input: %j",
    (input) => {
      expect(parse(input)).toBeNull()
    },
  )

  test.each([
    ["-12.3", -1230],
    ["+7", 700],
    ["$5", 500],
    ["-$1,000", -100000],
    [".5", 50],
    [" 42.07 ", 4207],
  ])("parses %j as %i cents", (input, cents) => {
    expect(parse(input)).toBe(cents)
  })

  test("never returns negative zero", () => {
    expect(Object.is(parse("-0.00"), 0)).toBe(true)
  })

  test("rejects amounts beyond the safe integer range", () => {
    expect(parse("900719925474099.92")).toBeNull()
  })
})

describe("format", () => {
  test.each([
    [125050, "$1,250.50"],
    [-1230, "-$12.30"],
    [0, "$0.00"],
    [5, "$0.05"],
  ])("formats %i cents as %s", (cents, text) => {
    expect(format(cents)).toBe(text)
  })

  test("can always show the sign, so colour is never the only cue", () => {
    expect(format(500, { sign: "always" })).toBe("+$5.00")
    expect(format(-500, { sign: "always" })).toBe("-$5.00")
    expect(format(0, { sign: "always" })).toBe("$0.00")
  })

  test("round-trips through parse", () => {
    expect(parse(format(-123456789))).toBe(-123456789)
  })
})

describe("roundHalfUp", () => {
  test.each([
    [2.5, 3],
    [2.4999, 2],
    [-2.5, -3],
    [-2.4999, -2],
    [-0.4, 0],
    [7, 7],
  ])("rounds %d cents to %i (halves away from zero)", (value, cents) => {
    expect(roundHalfUp(value)).toBe(cents)
  })
})

describe("allocate", () => {
  test("splits $100.00 three ways without losing a cent", () => {
    expect(allocate(10000, [1, 1, 1])).toEqual([3334, 3333, 3333])
  })

  test("splits by ratio", () => {
    expect(allocate(1000, [70, 30])).toEqual([700, 300])
  })

  test("splits an outflow into negative parts", () => {
    expect(allocate(-10000, [1, 1, 1])).toEqual([-3334, -3333, -3333])
  })

  test("rejects ratios that cannot split anything", () => {
    expect(() => allocate(100, [])).toThrow()
    expect(() => allocate(100, [0, 0])).toThrow()
    expect(() => allocate(100, [1, -1])).toThrow()
  })

  const amount = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 })
  const ratios = fc
    .array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 12 })
    .filter((rs) => rs.some((r) => r > 0))

  test("parts always sum exactly to the total", () => {
    fc.assert(
      fc.property(amount, ratios, (total, rs) => {
        expect(allocate(total, rs).reduce((a, b) => a + b, 0)).toBe(total)
      }),
    )
  })

  test("each part is within one cent of its exact share and keeps the total's sign", () => {
    fc.assert(
      fc.property(amount, ratios, (total, rs) => {
        const sum = rs.reduce((a, b) => a + b, 0)
        allocate(total, rs).forEach((part, i) => {
          expect(Number.isSafeInteger(part)).toBe(true)
          expect(Math.abs(part - (total * rs[i]!) / sum)).toBeLessThan(1)
          expect(part * Math.sign(total)).toBeGreaterThanOrEqual(0)
        })
      }),
    )
  })
})

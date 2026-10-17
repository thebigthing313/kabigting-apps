import { describe, expect, test } from "vitest"
import { balanceSince, compareToComputed } from "./balance-checks.ts"

describe("balanceSince", () => {
  test("is the check itself when nothing has posted since", () => {
    expect(balanceSince({ date: "2026-10-01", amountCents: 120_000 }, [])).toBe(120_000)
  })

  test("adds only the Actuals dated after the check, money out negative", () => {
    const actuals = [
      { date: "2026-10-01", amountCents: -5_000 }, // already in the check's end-of-day balance
      { date: "2026-10-02", amountCents: -2_500 },
      { date: "2026-10-05", amountCents: 40_000 },
    ]
    expect(balanceSince({ date: "2026-10-01", amountCents: 120_000 }, actuals)).toBe(157_500)
  })
})

describe("compareToComputed", () => {
  const previous = { date: "2026-10-01", amountCents: 100_000 }

  test("a Wallet's first check has nothing to compare against", () => {
    expect(compareToComputed({ date: "2026-10-08", amountCents: 90_000 }, undefined, [])).toBe(null)
  })

  test("computes from the previous check plus the Actuals between, through the check's date", () => {
    const actuals = [
      { date: "2026-10-01", amountCents: -1_000 }, // before the previous check closed
      { date: "2026-10-03", amountCents: -4_000 },
      { date: "2026-10-08", amountCents: -6_000 },
      { date: "2026-10-09", amountCents: -9_999 }, // after this check
    ]
    expect(
      compareToComputed({ date: "2026-10-08", amountCents: 90_000 }, previous, actuals),
    ).toEqual({ computedCents: 90_000, offByCents: 0 })
  })

  test("the difference is what the bank shows minus what was computed", () => {
    expect(compareToComputed({ date: "2026-10-08", amountCents: 98_750 }, previous, [])).toEqual({
      computedCents: 100_000,
      offByCents: -1_250,
    })
  })
})

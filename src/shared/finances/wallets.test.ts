import { describe, expect, test } from "vitest"
import { formatOffBy, formatShown, fromShown, toShown } from "./wallets.ts"

describe("shown as owed", () => {
  const card = { shownAsOwed: true }
  const checking = { shownAsOwed: false }

  test("a Wallet shown as owed displays a stored balance with its sign flipped", () => {
    expect(toShown(card, -125_000)).toBe(125_000)
    expect(toShown(card, 4_500)).toBe(-4_500)
  })

  test("any other Wallet displays the stored Amount as it is", () => {
    expect(toShown(checking, -125_000)).toBe(-125_000)
  })

  test("an entered Amount is stored with the sign flipped back", () => {
    expect(fromShown(card, 500_000)).toBe(-500_000)
    expect(fromShown(checking, 500_000)).toBe(500_000)
  })

  test("an Amount reads as the Wallet shows it", () => {
    expect(formatShown(checking, -4_250)).toBe("-$42.50")
    expect(formatShown(card, -125_000)).toBe("$1,250.00 owed")
  })

  test("a Balance check's difference reads with its sign, as the Wallet shows it", () => {
    expect(formatOffBy(checking, -1_250)).toBe("off by -$12.50")
    expect(formatOffBy(checking, 1_250)).toBe("off by +$12.50")
    // The bank shows $12.50 less owed than computed.
    expect(formatOffBy(card, 1_250)).toBe("off by -$12.50")
  })

  test("zero stays zero, never negative zero", () => {
    expect(Object.is(toShown(card, 0), 0)).toBe(true)
    expect(Object.is(fromShown(card, 0), 0)).toBe(true)
  })
})

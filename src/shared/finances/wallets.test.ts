import { describe, expect, test } from "vitest"
import { fromShown, toShown } from "./wallets.ts"

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

  test("zero stays zero, never negative zero", () => {
    expect(Object.is(toShown(card, 0), 0)).toBe(true)
    expect(Object.is(fromShown(card, 0), 0)).toBe(true)
  })
})

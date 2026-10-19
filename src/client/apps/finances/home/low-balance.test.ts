import { describe, expect, test } from "vitest"
import {
  inTheRed,
  lowBalanceDetail,
  lowPoint,
  thresholdWarning,
} from "@/apps/finances/home/low-balance"

const checking = { shownAsOwed: false, lowBalanceThresholdCents: 50_000 }
const card = { shownAsOwed: true, lowBalanceThresholdCents: -500_000 }

describe("thresholdWarning", () => {
  test("a Wallet goes under its threshold", () => {
    expect(thresholdWarning(checking, "2026-10-20")).toBe(
      "Under the $500.00 threshold on Oct 20, 2026",
    )
  })

  test("a Wallet shown as owed owes more than it", () => {
    expect(thresholdWarning(card, "2026-10-20")).toBe("Owes more than $5,000.00 on Oct 20, 2026")
  })
})

describe("lowPoint", () => {
  test("a Wallet's lowest balance", () => {
    expect(lowPoint(checking, { date: "2026-10-20", balanceCents: -2_500 })).toBe(
      "Lowest -$25.00 on Oct 20, 2026",
    )
  })

  test("a Wallet shown as owed's lowest balance is its most owed", () => {
    expect(lowPoint(card, { date: "2026-10-20", balanceCents: -450_000 })).toBe(
      "Most owed $4,500.00 on Oct 20, 2026",
    )
  })
})

describe("lowBalanceDetail", () => {
  test("a low balance, or owed on a Wallet shown as owed", () => {
    expect(lowBalanceDetail(checking, 30)).toBe("Low balance in the next 30 days")
    expect(lowBalanceDetail(card, 90)).toBe("Owed in the next 90 days")
  })
})

describe("inTheRed", () => {
  test("a balance under $0 is red, whatever the threshold", () => {
    expect(inTheRed(checking, -1)).toBe(true)
    expect(inTheRed(checking, 0)).toBe(false)
    expect(inTheRed(checking, 10_000)).toBe(false)
  })

  test("on a Wallet shown as owed, only owing more than its threshold is red", () => {
    expect(inTheRed(card, -450_000)).toBe(false)
    expect(inTheRed(card, -500_000)).toBe(false)
    expect(inTheRed(card, -500_001)).toBe(true)
  })

  test("nothing is red on a Wallet shown as owed with a $0 threshold", () => {
    expect(inTheRed({ shownAsOwed: true, lowBalanceThresholdCents: 0 }, -900_000)).toBe(false)
  })
})

import { describe, expect, test } from "vitest"
import { lowBalanceDetail, lowPoint, thresholdWarning } from "@/apps/finances/home/low-balance"

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

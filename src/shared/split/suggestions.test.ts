// Suggested Payments: one way to bring every Balance to zero, worked out from the Balances alone.
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import { householdBalances, paymentEntry, suggestedPayments, balances } from "./rules.ts"
import type { Shares } from "./schemas.ts"

// Made-up Accounts, oldest first. Dee is a Former member; the others are Members.
const ORDER = ["dee", "ana", "ben", "cy", "eve"]

/** The Balances after every suggestion is recorded as a Payment. */
function afterSuggestions(start: Shares, order: readonly string[]): Shares {
  const payments = suggestedPayments(start, order)
  return balances([{ paidShares: start, owedShares: {} }, ...payments.map(paymentEntry)], order)
}

/** Balances for some of `ORDER`, adding up to zero as Balances always do. */
const household = fc
  .tuple(
    fc.subarray(ORDER, { minLength: 1 }),
    fc.array(fc.integer({ min: -1_000_000, max: 1_000_000 }), {
      minLength: ORDER.length,
      maxLength: ORDER.length,
    }),
  )
  .map(([ids, cents]) => {
    const result: Shares = {}
    ids.forEach((id, index) => {
      result[id] = index === ids.length - 1 ? 0 : (cents[index] ?? 0)
    })
    const last = ids.at(-1) ?? ""
    result[last] = -Object.values(result).reduce((a, b) => a + b, 0)
    return result
  })

describe("suggestedPayments", () => {
  test("the biggest debtor pays the biggest creditor, until everyone is at zero", () => {
    expect(suggestedPayments({ ana: 6_000, ben: -1_000, cy: -5_000 }, ORDER)).toEqual([
      { fromId: "cy", toId: "ana", amount: 5_000 },
      { fromId: "ben", toId: "ana", amount: 1_000 },
    ])
    expect(suggestedPayments({ ana: 3_000, ben: 2_000, cy: -4_000, eve: -1_000 }, ORDER)).toEqual([
      { fromId: "cy", toId: "ana", amount: 3_000 },
      { fromId: "cy", toId: "ben", amount: 1_000 },
      { fromId: "eve", toId: "ben", amount: 1_000 },
    ])
  })

  test("equal Balances go oldest Account first", () => {
    expect(suggestedPayments({ cy: -1_000, ben: -1_000, eve: 1_000, ana: 1_000 }, ORDER)).toEqual([
      { fromId: "ben", toId: "ana", amount: 1_000 },
      { fromId: "cy", toId: "eve", amount: 1_000 },
    ])
  })

  test("when everyone is at zero there is nothing to suggest", () => {
    expect(suggestedPayments({}, ORDER)).toEqual([])
    expect(suggestedPayments({ dee: 0, ana: 0, ben: 0 }, ORDER)).toEqual([])
  })

  test("a Former member with a Balance is settled like anyone else; at zero, left out", () => {
    // Dee lost App access owing $20.00; Ana is owed it. Ben's Payments to Cy came out even.
    const start = householdBalances(
      [{ paidShares: { ana: 2_000 }, owedShares: { dee: 2_000 } }],
      [
        { fromId: "ben", toId: "cy", amount: 500 },
        { fromId: "cy", toId: "ben", amount: 500 },
      ],
      ["dee", "ana", "ben", "cy"],
    )
    expect(suggestedPayments(start, ORDER)).toEqual([{ fromId: "dee", toId: "ana", amount: 2_000 }])
    expect(suggestedPayments({ dee: 0, ana: 1_000, ben: -1_000 }, ORDER)).toEqual([
      { fromId: "ben", toId: "ana", amount: 1_000 },
    ])
  })

  test("someone the order doesn't know goes after everyone it does", () => {
    expect(suggestedPayments({ zed: -500, ana: -500, ben: 1_000 }, ORDER)).toEqual([
      { fromId: "ana", toId: "ben", amount: 500 },
      { fromId: "zed", toId: "ben", amount: 500 },
    ])
  })

  test("recording every suggestion brings every Balance to zero", () => {
    fc.assert(
      fc.property(household, (start) => {
        for (const cents of Object.values(afterSuggestions(start, ORDER))) expect(cents).toBe(0)
      }),
    )
  })

  test("every suggestion is a positive Amount between two different Accounts", () => {
    fc.assert(
      fc.property(household, (start) => {
        for (const payment of suggestedPayments(start, ORDER)) {
          expect(payment.amount).toBeGreaterThan(0)
          expect(Number.isSafeInteger(payment.amount)).toBe(true)
          expect(payment.fromId).not.toBe(payment.toId)
        }
      }),
    )
  })

  test("it takes at most one Payment fewer than the Accounts not at zero", () => {
    fc.assert(
      fc.property(household, (start) => {
        const unsettled = Object.values(start).filter((cents) => cents !== 0).length
        expect(suggestedPayments(start, ORDER).length).toBeLessThanOrEqual(
          Math.max(0, unsettled - 1),
        )
      }),
    )
  })

  test("the same Balances always give the same suggestions, whatever order they come in", () => {
    fc.assert(
      fc.property(household, (start) => {
        const reversed = Object.fromEntries(Object.entries(start).toReversed())
        expect(suggestedPayments(reversed, ORDER)).toEqual(suggestedPayments(start, ORDER))
      }),
    )
  })
})

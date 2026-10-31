// The Split rules for Payments: what blocks a save, and how a Payment moves Balances.
import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  balances,
  editPaymentAllowed,
  effect,
  equalSide,
  householdBalances,
  newExpenseRoster,
  paymentEntry,
  paymentProblems,
  resolveExpense,
  type PaymentInput,
} from "./rules.ts"

// Made-up Members, oldest Account first.
const ORDER = ["ana", "ben", "cy"]
const MEMBERS = new Set(ORDER)

function payment(overrides: Partial<PaymentInput> = {}): PaymentInput {
  return { date: "2026-10-31", fromId: "ana", toId: "ben", amount: 4_000, ...overrides }
}

describe("paymentProblems", () => {
  test("a positive Amount between two different Members has none", () => {
    expect(paymentProblems(payment(), MEMBERS)).toEqual([])
  })

  test("a Payment to oneself is refused", () => {
    expect(paymentProblems(payment({ toId: "ana" }), MEMBERS)).toEqual([
      { field: "toId", message: "Pick two different Members" },
    ])
  })

  test.each([0, -1, -4_000, 0.5, Number.NaN])("an Amount of %s is refused", (amount) => {
    expect(paymentProblems(payment({ amount }), MEMBERS)).toEqual([
      { field: "amount", message: "Enter an amount above zero" },
    ])
  })

  test("names every field that blocks it, in the form's order", () => {
    expect(
      paymentProblems(payment({ fromId: "dee", toId: "eve", amount: 0, date: "" }), MEMBERS),
    ).toEqual([
      { field: "fromId", message: "Only Members can be on a Payment" },
      { field: "toId", message: "Only Members can be on a Payment" },
      { field: "amount", message: "Enter an amount above zero" },
      { field: "date", message: "Pick a date" },
    ])
  })

  test("an edit keeps whoever is already on it, but can't add anyone else", () => {
    const allowed = editPaymentAllowed(ORDER, { fromId: "dee", toId: "ana" })
    expect(paymentProblems(payment({ fromId: "dee" }), allowed)).toEqual([])
    expect(paymentProblems(payment({ toId: "eve" }), allowed)).toEqual([
      { field: "toId", message: "Only Members can be on a Payment" },
    ])
  })
})

describe("a Payment in the Balances", () => {
  test("whoever sends it goes up by its Amount, and whoever gets it goes down", () => {
    expect(effect(paymentEntry(payment()))).toEqual({ ana: 4_000, ben: -4_000 })
  })

  test("settles a debt: after Ben pays Ana what he owes, both are at zero", () => {
    const groceries = { paidShares: { ana: 6_000 }, owedShares: { ana: 3_000, ben: 3_000 } }
    const settled = paymentEntry(payment({ fromId: "ben", toId: "ana", amount: 3_000 }))
    expect(balances([groceries], ORDER)).toEqual({ ana: 3_000, ben: -3_000, cy: 0 })
    expect(balances([groceries, settled], ORDER)).toEqual({ ana: 0, ben: 0, cy: 0 })
  })

  test("Balances from Expenses and Payments together still add up to zero", () => {
    const expense = fc
      .tuple(
        fc.integer({ min: -1_000_000, max: 1_000_000 }).filter((total) => total !== 0),
        fc.subarray(ORDER, { minLength: 1 }),
        fc.subarray(ORDER, { minLength: 1 }),
      )
      .map(([total, payers, owers]) => {
        const resolved = resolveExpense(
          {
            description: "Made-up",
            date: "2026-10-31",
            total,
            paid: equalSide(payers),
            owed: equalSide(owers),
          },
          newExpenseRoster(ORDER),
        )
        if (!resolved.ok) throw new Error("Expected a valid Expense")
        return resolved
      })
    const paid = fc
      .tuple(
        fc.constantFrom(...ORDER),
        fc.constantFrom(...ORDER),
        fc.integer({ min: 1, max: 1_000_000 }),
      )
      .filter(([fromId, toId]) => fromId !== toId)
      .map(([fromId, toId, amount]) => ({ fromId, toId, amount }))
    fc.assert(
      fc.property(
        fc.array(expense, { maxLength: 20 }),
        fc.array(paid, { maxLength: 20 }),
        (expenses, payments) => {
          const totals = householdBalances(expenses, payments, ORDER)
          expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(0)
          expect(totals).toEqual(balances([...expenses, ...payments.map(paymentEntry)], ORDER))
        },
      ),
    )
  })
})

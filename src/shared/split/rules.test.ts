import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  balances,
  effect,
  effectOn,
  equalSide,
  resolveExpense,
  resolveSide,
  type ExpenseInput,
} from "./rules.ts"

// Made-up Members, oldest Account first.
const ORDER = ["ana", "ben", "cy"]

describe("resolveSide: Equal", () => {
  test("splits the total evenly among the Members ticked", () => {
    expect(resolveSide(9_000, equalSide(ORDER), ORDER)).toEqual({
      ok: true,
      shares: { ana: 3_000, ben: 3_000, cy: 3_000 },
      status: "3 ways",
    })
  })

  test("one Member ticked takes it all: the one-payer answer", () => {
    expect(resolveSide(5_400, equalSide(["ben"]), ORDER)).toEqual({
      ok: true,
      shares: { ben: 5_400 },
      status: "1 person",
    })
  })

  test("leftover cents go to the oldest Accounts first, whatever order they were ticked in", () => {
    const result = resolveSide(1_000, equalSide(["cy", "ben", "ana"]), ORDER)
    expect(result).toMatchObject({ ok: true, shares: { ana: 334, ben: 333, cy: 333 } })
    const two = resolveSide(1_001, equalSide(["cy", "ana", "ben"]), ORDER)
    expect(two).toMatchObject({ shares: { ana: 334, ben: 334, cy: 333 } })
  })

  test("only the Members ticked share it, still in Account order", () => {
    expect(resolveSide(101, equalSide(["cy", "ben"]), ORDER)).toMatchObject({
      shares: { ben: 51, cy: 50 },
    })
  })

  test("a Refund splits the same way, with every share negative", () => {
    expect(resolveSide(-1_000, equalSide(ORDER), ORDER)).toMatchObject({
      shares: { ana: -334, ben: -333, cy: -333 },
    })
  })

  test("a share that rounds to nothing is left out", () => {
    expect(resolveSide(2, equalSide(ORDER), ORDER)).toMatchObject({
      shares: { ana: 1, ben: 1 },
    })
  })

  test("nobody ticked is a problem", () => {
    expect(resolveSide(1_000, equalSide([]), ORDER)).toEqual({
      ok: false,
      problem: "Tick at least one Member",
      status: "Tick at least one Member",
    })
  })

  test("someone ticked who isn't a Member is a problem", () => {
    expect(resolveSide(1_000, equalSide(["ana", "zed"]), ORDER)).toMatchObject({
      ok: false,
      problem: "Only Members can be on an Expense",
    })
  })

  test("shares always add up to the total and differ by at most a cent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }).filter((total) => total !== 0),
        fc.subarray(ORDER, { minLength: 1 }),
        (total, ticked) => {
          const result = resolveSide(total, equalSide(ticked), ORDER)
          if (!result.ok) throw new Error(result.problem)
          const values = ticked.map((member) => result.shares[member] ?? 0)
          expect(values.reduce((a, b) => a + b, 0)).toBe(total)
          expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1)
        },
      ),
    )
  })
})

function expense(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    description: "Groceries run",
    date: "2026-10-31",
    total: 9_000,
    paid: equalSide(["ana"]),
    owed: equalSide(ORDER),
    ...overrides,
  }
}

describe("resolveExpense", () => {
  test("gives the Paid and Owed shares of a valid Expense", () => {
    expect(resolveExpense(expense(), ORDER)).toEqual({
      ok: true,
      paidShares: { ana: 9_000 },
      owedShares: { ana: 3_000, ben: 3_000, cy: 3_000 },
    })
  })

  test("an Expense paid and owed by the same one Member is allowed", () => {
    expect(
      resolveExpense(expense({ paid: equalSide(["ben"]), owed: equalSide(["ben"]) }), ORDER),
    ).toMatchObject({ ok: true, paidShares: { ben: 9_000 }, owedShares: { ben: 9_000 } })
  })

  test("names every field that blocks the save", () => {
    const result = resolveExpense(
      expense({ description: "  ", date: "2026-02-30", total: 0, owed: equalSide([]) }),
      ORDER,
    )
    expect(result).toEqual({
      ok: false,
      problems: [
        { field: "description", message: "Add a description" },
        { field: "date", message: "Pick a date" },
        { field: "total", message: "Enter a total other than zero" },
        { field: "owed", message: "Tick at least one Member" },
      ],
    })
  })
})

describe("Balances", () => {
  const groceries = {
    paidShares: { ana: 9_000 },
    owedShares: { ana: 3_000, ben: 3_000, cy: 3_000 },
  }
  const pizza = { paidShares: { cy: 5_400 }, owedShares: { ben: 2_700, cy: 2_700 } }

  test("an Expense moves each Member by their Paid share less their Owed share", () => {
    expect(effect(groceries)).toEqual({ ana: 6_000, ben: -3_000, cy: -3_000 })
    expect(effectOn(groceries, "ana")).toBe(6_000)
    expect(effectOn(pizza, "ana")).toBe(0)
  })

  test("a Balance is the sum of every effect, and every Member gets one", () => {
    expect(balances([groceries, pizza], [...ORDER, "dee"])).toEqual({
      ana: 6_000,
      ben: -5_700,
      cy: -300,
      dee: 0,
    })
  })

  test("Balances always add up to zero", () => {
    const entry = fc
      .tuple(
        fc.integer({ min: -1_000_000, max: 1_000_000 }).filter((total) => total !== 0),
        fc.subarray(ORDER, { minLength: 1 }),
        fc.subarray(ORDER, { minLength: 1 }),
      )
      .map(([total, payers, owers]) => {
        const resolved = resolveExpense(
          expense({ total, paid: equalSide(payers), owed: equalSide(owers) }),
          ORDER,
        )
        if (!resolved.ok) throw new Error("Expected a valid Expense")
        return resolved
      })
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 20 }), (entries) => {
        const sum = Object.values(balances(entries, ORDER)).reduce((a, b) => a + b, 0)
        expect(sum).toBe(0)
      }),
    )
  })
})

import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  balances,
  effect,
  effectOn,
  equalSide,
  newExpenseRoster,
  resolveExpense,
  resolveSide,
  type ExpenseInput,
} from "./rules.ts"

// Made-up Members, oldest Account first.
const ORDER = ["ana", "ben", "cy"]
const ROSTER = newExpenseRoster(ORDER)

describe("resolveSide: Equal", () => {
  test("splits the total evenly among the Members ticked", () => {
    expect(resolveSide(9_000, equalSide(ORDER), ROSTER)).toEqual({
      ok: true,
      shares: { ana: 3_000, ben: 3_000, cy: 3_000 },
      status: "3 ways",
    })
  })

  test("one Member ticked takes it all: the one-payer answer", () => {
    expect(resolveSide(5_400, equalSide(["ben"]), ROSTER)).toEqual({
      ok: true,
      shares: { ben: 5_400 },
      status: "1 Member",
    })
  })

  test("leftover cents go to the oldest Accounts first, whatever order they were ticked in", () => {
    const result = resolveSide(1_000, equalSide(["cy", "ben", "ana"]), ROSTER)
    expect(result).toMatchObject({ ok: true, shares: { ana: 334, ben: 333, cy: 333 } })
    const two = resolveSide(1_001, equalSide(["cy", "ana", "ben"]), ROSTER)
    expect(two).toMatchObject({ shares: { ana: 334, ben: 334, cy: 333 } })
  })

  test("only the Members ticked share it, still in Account order", () => {
    expect(resolveSide(101, equalSide(["cy", "ben"]), ROSTER)).toMatchObject({
      shares: { ben: 51, cy: 50 },
    })
  })

  test("a Refund splits the same way, with every share negative", () => {
    expect(resolveSide(-1_000, equalSide(ORDER), ROSTER)).toMatchObject({
      shares: { ana: -334, ben: -333, cy: -333 },
    })
  })

  test("a share that rounds to nothing is left out", () => {
    expect(resolveSide(2, equalSide(ORDER), ROSTER)).toMatchObject({
      shares: { ana: 1, ben: 1 },
    })
  })

  test("nobody ticked is a problem", () => {
    expect(resolveSide(1_000, equalSide([]), ROSTER)).toEqual({
      ok: false,
      problem: "Tick at least one Member",
      status: "Tick at least one Member",
    })
  })

  test("someone ticked who isn't a Member is a problem", () => {
    expect(resolveSide(1_000, equalSide(["ana", "zed"]), ROSTER)).toMatchObject({
      ok: false,
      problem: "Only Members can be on an Expense",
    })
  })

  test("someone in the order but not allowed on the Expense is refused", () => {
    // Dee, an older Account no longer a Member, sets the order but can't be newly added.
    const roster = { order: ["dee", ...ORDER], allowed: new Set(ORDER) }
    expect(resolveSide(1_000, equalSide(["dee", "ana"]), roster)).toMatchObject({
      ok: false,
      problem: "Only Members can be on an Expense",
    })
  })

  test("leftover cents follow the whole order, not only the current Members", () => {
    // When editing, Dee is already on the Expense and allowed; her older Account comes first.
    const roster = { order: ["dee", ...ORDER], allowed: new Set(["dee", ...ORDER]) }
    expect(resolveSide(1_001, equalSide(["ana", "ben", "dee"]), roster)).toMatchObject({
      ok: true,
      shares: { dee: 334, ana: 334, ben: 333 },
    })
  })

  test("shares always add up to the total and differ by at most a cent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }).filter((total) => total !== 0),
        fc.subarray(ORDER, { minLength: 1 }),
        (total, ticked) => {
          const result = resolveSide(total, equalSide(ticked), ROSTER)
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
    expect(resolveExpense(expense(), ROSTER)).toEqual({
      ok: true,
      paidShares: { ana: 9_000 },
      owedShares: { ana: 3_000, ben: 3_000, cy: 3_000 },
    })
  })

  test("an Expense paid and owed by the same one Member is allowed", () => {
    expect(
      resolveExpense(expense({ paid: equalSide(["ben"]), owed: equalSide(["ben"]) }), ROSTER),
    ).toMatchObject({ ok: true, paidShares: { ben: 9_000 }, owedShares: { ben: 9_000 } })
  })

  test("names every field that blocks the save", () => {
    const result = resolveExpense(
      expense({ description: "  ", date: "2026-02-30", total: 0, owed: equalSide([]) }),
      ROSTER,
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
          ROSTER,
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

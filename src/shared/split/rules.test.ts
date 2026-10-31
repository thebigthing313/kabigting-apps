import fc from "fast-check"
import { describe, expect, test } from "vitest"
import {
  balances,
  effect,
  effectOn,
  equalSide,
  newExpenseRoster,
  parsePercent,
  resolveExpense,
  resolveSide,
  type ExpenseInput,
} from "./rules.ts"
import type { Side } from "./schemas.ts"

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

/** Hundredths of a percent as a person would type them: 4550 → "45.50". */
function typed(hundredths: number): string {
  return (hundredths / 100).toFixed(2)
}

function exact(cents: Side["exact"]): Side {
  return { mode: "exact", ticked: [], exact: cents, percent: {} }
}

function percent(percents: Side["percent"]): Side {
  return { mode: "percent", ticked: [], exact: {}, percent: percents }
}

describe("resolveSide: Exact", () => {
  test("passes the cents typed through", () => {
    expect(resolveSide(9_000, exact({ ana: 5_000, ben: 4_000 }), ROSTER)).toEqual({
      ok: true,
      shares: { ana: 5_000, ben: 4_000 },
      status: "2 ways",
    })
  })

  test("a blank or zero entry is no share", () => {
    expect(resolveSide(9_000, exact({ ana: 9_000, ben: null, cy: 0 }), ROSTER)).toEqual({
      ok: true,
      shares: { ana: 9_000 },
      status: "1 Member",
    })
  })

  test("says what is left to assign while the cents fall short", () => {
    expect(resolveSide(9_000, exact({ ana: 5_000, ben: null }), ROSTER)).toEqual({
      ok: false,
      problem: "$40.00 left to assign",
      status: "$40.00 left to assign",
    })
    expect(resolveSide(9_000, exact({}), ROSTER)).toMatchObject({
      problem: "$90.00 left to assign",
    })
  })

  test("says how far over the cents go", () => {
    expect(resolveSide(9_000, exact({ ana: 5_000, ben: 5_200 }), ROSTER)).toMatchObject({
      ok: false,
      problem: "$12.00 over",
    })
  })

  test("a Refund's amounts are typed without a minus, and its shares come out negative", () => {
    expect(resolveSide(-3_000, exact({ ana: 1_000, ben: 2_000 }), ROSTER)).toEqual({
      ok: true,
      shares: { ana: -1_000, ben: -2_000 },
      status: "2 ways",
    })
    expect(resolveSide(-3_000, exact({ ana: 1_000 }), ROSTER)).toMatchObject({
      problem: "$20.00 left to assign",
    })
    expect(resolveSide(-3_000, exact({ ana: 4_000 }), ROSTER)).toMatchObject({
      problem: "$10.00 over",
    })
  })

  test("a negative amount is refused, on a cost or a Refund", () => {
    for (const total of [1_000, -1_000]) {
      expect(resolveSide(total, exact({ ana: 2_000, ben: -1_000 }), ROSTER)).toMatchObject({
        ok: false,
        problem: "Enter each amount without a minus sign",
      })
    }
  })

  test("someone with cents who isn't allowed on the Expense is refused", () => {
    expect(resolveSide(1_000, exact({ ana: 500, zed: 500 }), ROSTER)).toMatchObject({
      ok: false,
      problem: "Only Members can be on an Expense",
    })
    // Nothing typed for them is no share, so it doesn't count.
    expect(resolveSide(1_000, exact({ ana: 1_000, zed: null }), ROSTER)).toMatchObject({
      ok: true,
    })
  })

  test("only the inputs of the side's mode count", () => {
    const side: Side = { mode: "exact", ticked: ["zed"], exact: { ben: 1_000 }, percent: {} }
    expect(resolveSide(1_000, side, ROSTER)).toMatchObject({ ok: true, shares: { ben: 1_000 } })
  })
})

describe("parsePercent", () => {
  test("reads up to two decimals as hundredths of a percent", () => {
    expect(parsePercent("33.33")).toBe(3_333)
    expect(parsePercent("4.5")).toBe(450)
    expect(parsePercent("100")).toBe(10_000)
    expect(parsePercent(" 12% ")).toBe(1_200)
    expect(parsePercent(".5")).toBe(50)
    expect(parsePercent("7.")).toBe(700)
    expect(parsePercent("0")).toBe(0)
  })

  test("refuses anything else", () => {
    for (const text of ["", ".", "%", "33.333", "-5", "1e2", "abc", "1,000", "12.5.0", "1000"]) {
      expect(parsePercent(text)).toBeNull()
    }
  })
})

describe("resolveSide: Percent", () => {
  test("rounds each percent of the total to cents", () => {
    expect(resolveSide(9_000, percent({ ana: "50", ben: "30", cy: "20" }), ROSTER)).toEqual({
      ok: true,
      shares: { ana: 4_500, ben: 2_700, cy: 1_800 },
      status: "3 ways",
    })
  })

  test("leftover cents go by the largest remainder, then the oldest Account", () => {
    // $0.10 at 33.33 / 33.33 / 33.34: Cy's remainder is the largest, so Cy gets the cent.
    expect(
      resolveSide(10, percent({ ana: "33.33", ben: "33.33", cy: "33.34" }), ROSTER),
    ).toMatchObject({ shares: { ana: 3, ben: 3, cy: 4 } })
    // $10.01: Ana's remainder is the largest; Ben and Cy tie for the second cent, and Ben's
    // Account is the older, whatever order the percents were typed in.
    expect(
      resolveSide(1_001, percent({ cy: "33.33", ben: "33.33", ana: "33.34" }), ROSTER),
    ).toMatchObject({ shares: { ana: 334, ben: 334, cy: 333 } })
  })

  test("a blank or zero percent is no share", () => {
    expect(resolveSide(1_000, percent({ ana: "100", ben: "", cy: "0" }), ROSTER)).toEqual({
      ok: true,
      shares: { ana: 1_000 },
      status: "1 Member",
    })
  })

  test("must add up to exactly 100.00", () => {
    expect(resolveSide(1_000, percent({ ana: "50", ben: "45.5" }), ROSTER)).toEqual({
      ok: false,
      problem: "4.5% left to assign",
      status: "4.5% left to assign",
    })
    expect(resolveSide(1_000, percent({ ana: "50", ben: "50.01" }), ROSTER)).toMatchObject({
      problem: "0.01% over",
    })
    expect(resolveSide(1_000, percent({}), ROSTER)).toMatchObject({
      problem: "100% left to assign",
    })
  })

  test("a percent that isn't a number with up to two decimals is a problem", () => {
    expect(resolveSide(1_000, percent({ ana: "50", ben: "49.999" }), ROSTER)).toMatchObject({
      ok: false,
      problem: "Enter each percent with up to two decimals",
    })
  })

  test("a Refund splits the same way, with every share negative", () => {
    expect(resolveSide(-1_000, percent({ ana: "25", ben: "75" }), ROSTER)).toMatchObject({
      ok: true,
      shares: { ana: -250, ben: -750 },
    })
  })

  test("someone with a percent who isn't allowed on the Expense is refused", () => {
    expect(resolveSide(1_000, percent({ ana: "50", zed: "50" }), ROSTER)).toMatchObject({
      ok: false,
      problem: "Only Members can be on an Expense",
    })
  })

  test("shares always add up to the total", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }).filter((total) => total !== 0),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (total, first, second) => {
          const [low, high] = [Math.min(first, second), Math.max(first, second)]
          const side = percent({
            ana: typed(low),
            ben: typed(high - low),
            cy: typed(10_000 - high),
          })
          const result = resolveSide(total, side, ROSTER)
          if (!result.ok) throw new Error(result.problem)
          expect(Object.values(result.shares).reduce((a, b) => a + b, 0)).toBe(total)
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

  test("each side has its own Split mode", () => {
    expect(
      resolveExpense(
        expense({
          paid: exact({ ana: 6_000, ben: 3_000 }),
          owed: percent({ ana: "50", ben: "25", cy: "25" }),
        }),
        ROSTER,
      ),
    ).toEqual({
      ok: true,
      paidShares: { ana: 6_000, ben: 3_000 },
      owedShares: { ana: 4_500, ben: 2_250, cy: 2_250 },
    })
  })

  test("a negative total is a Refund, with the shares negative on both sides", () => {
    expect(resolveExpense(expense({ total: -3_000 }), ROSTER)).toEqual({
      ok: true,
      paidShares: { ana: -3_000 },
      owedShares: { ana: -1_000, ben: -1_000, cy: -1_000 },
    })
  })

  test("names a side that doesn't add up to the total", () => {
    expect(
      resolveExpense(
        expense({ paid: exact({ ana: 8_000 }), owed: percent({ ana: "50", ben: "60" }) }),
        ROSTER,
      ),
    ).toEqual({
      ok: false,
      problems: [
        { field: "paid", message: "$10.00 left to assign" },
        { field: "owed", message: "10% over" },
      ],
    })
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

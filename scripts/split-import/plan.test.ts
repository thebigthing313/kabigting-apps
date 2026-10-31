// The Splitwise import mapping on made-up API responses. Every id, name, email, description and
// amount here is invented.
import { describe, expect, test } from "vitest"
import { CATEGORY_MAP, mapCategory } from "./categories.ts"
import type { MappingEntry } from "./mapping.ts"
import { planImport, type ImportAccount } from "./plan.ts"
import { formatReport } from "./report.ts"
import { SnapshotInvalid } from "./snapshot.ts"

// Made-up Splitwise users and the Accounts they map to, oldest Account first.
const ADA = 501
const BO = 502
const CY = 503
const accounts: ImportAccount[] = [
  { id: "acct-ada", email: "ada@example.com", access: true },
  { id: "acct-bo", email: "bo@example.com", access: true },
  { id: "acct-cy", email: "cy@example.com", access: false },
]
const mapping: MappingEntry[] = [
  { number: 1, splitwiseId: String(ADA), email: "ada@example.com" },
  { number: 2, splitwiseId: String(BO), email: "bo@example.com" },
  { number: 3, splitwiseId: String(CY), email: "cy@example.com" },
]
const NAMES: Record<number, string> = { [ADA]: "Ada", [BO]: "Bo", [CY]: "Cy" }

/** Cents as Splitwise writes amounts: "12.5", "0.0". */
function decimal(cents: number): string {
  const sign = cents < 0 ? "-" : ""
  const abs = Math.abs(cents)
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`
}

type User = { user_id: number; paid_share: string; owed_share: string; net_balance: string }

/** One user on a row, in cents. */
function user(id: number, paid: number, owed: number): User {
  return {
    user_id: id,
    paid_share: decimal(paid),
    owed_share: decimal(owed),
    net_balance: decimal(paid - owed),
  }
}

let nextId = 7000

/** A live Splitwise expense row: Ada paid $30.00 for groceries she and Bo split equally. */
function row(changes: Record<string, unknown> = {}) {
  nextId += 1
  return {
    id: nextId,
    group_id: 4242,
    description: "Made-up groceries",
    details: null,
    payment: false,
    cost: "30.0",
    currency_code: "USD",
    date: "2025-03-14T17:00:00Z",
    created_at: "2025-03-14T17:05:00Z",
    updated_at: "2025-03-14T17:05:00Z",
    deleted_at: null,
    category: { id: 12, name: "Groceries" },
    users: [user(ADA, 3_000, 1_500), user(BO, 0, 1_500)],
    repayments: [],
    ...changes,
  }
}

/** A Splitwise payment row: `from` handed `to` the amount. */
function paymentRow(
  from: number,
  to: number,
  cents: number,
  changes: Record<string, unknown> = {},
) {
  return row({
    payment: true,
    description: "Payment",
    cost: decimal(cents),
    category: { id: 18, name: "General" },
    users: [user(from, cents, 0), user(to, 0, cents)],
    ...changes,
  })
}

/** What each user's Balance comes to over the live rows, as Splitwise would report it. */
function balancesOf(rows: readonly ReturnType<typeof row>[]): Map<number, number> {
  const totals = new Map<number, number>([
    [ADA, 0],
    [BO, 0],
    [CY, 0],
  ])
  for (const each of rows) {
    if (each.deleted_at) continue
    for (const u of each.users) {
      const net = Math.round(Number(u.paid_share) * 100) - Math.round(Number(u.owed_share) * 100)
      totals.set(u.user_id, (totals.get(u.user_id) ?? 0) + net)
    }
  }
  return totals
}

/**
 * The file `split:fetch` writes, its rows split over pages of two. The group's balances match the
 * rows unless given; a settled member's balance list is empty, as Splitwise sends it.
 */
function snapshot(
  rows: readonly ReturnType<typeof row>[],
  balances: Map<number, number> = balancesOf(rows),
) {
  const pages = []
  for (let at = 0; at < rows.length || at === 0; at += 2) {
    pages.push({ expenses: rows.slice(at, at + 2) })
  }
  return {
    groupId: "4242",
    fetchedAt: "2026-10-31T12:00:00.000Z",
    group: {
      group: {
        id: 4242,
        name: "Made-up household",
        members: [...balances].map(([id, cents]) => ({
          id,
          first_name: NAMES[id],
          last_name: "Example",
          email: `${NAMES[id]?.toLowerCase()}@example.com`,
          balance: cents === 0 ? [] : [{ currency_code: "USD", amount: decimal(cents) }],
        })),
      },
    },
    expensePages: pages,
  }
}

function plan(rows: readonly ReturnType<typeof row>[], balances?: Map<number, number>) {
  return planImport(snapshot(rows, balances), mapping, accounts)
}

const exact = (shares: Record<string, number>) => ({
  mode: "exact",
  ticked: Object.keys(shares),
  exact: shares,
  percent: {},
})

describe("expense rows", () => {
  test("become Expenses in exact dollars, with real Paid and Owed shares and details as the note", () => {
    const result = plan([row({ details: "  Made-up note  " })])
    expect(result.report.failures).toEqual([])
    expect(result.expenses).toEqual([
      {
        row: 1,
        date: "2025-03-14",
        description: "Made-up groceries",
        note: "Made-up note",
        category: "Groceries",
        total: 3_000,
        paid: exact({ "acct-ada": 3_000 }),
        owed: exact({ "acct-ada": 1_500, "acct-bo": 1_500 }),
        paidShares: { "acct-ada": 3_000 },
        owedShares: { "acct-ada": 1_500, "acct-bo": 1_500 },
      },
    ])
    expect(result.payments).toEqual([])
  })

  test("amounts convert to exact cents, whatever decimals Splitwise writes", () => {
    const result = plan([
      row({
        cost: "10.5",
        users: [
          { user_id: ADA, paid_share: "10.50", owed_share: "3.5" },
          { user_id: BO, paid_share: "0.0", owed_share: "3.50" },
          { user_id: CY, paid_share: "0", owed_share: "3.500" },
        ],
      }),
    ])
    expect(result.report.failures).toEqual([])
    expect(result.expenses[0]?.owedShares).toEqual({
      "acct-ada": 350,
      "acct-bo": 350,
      "acct-cy": 350,
    })
  })

  test("an amount finer than a cent fails, naming the row and field only", () => {
    const result = plan(
      [
        row(),
        row({
          cost: "10.005",
          users: [
            { user_id: ADA, paid_share: "10.005", owed_share: "3.335" },
            { user_id: BO, paid_share: "0.0", owed_share: "6.67" },
          ],
        }),
      ],
      new Map([
        [ADA, 1_500],
        [BO, -1_500],
        [CY, 0],
      ]),
    )
    expect(result.report.failures).toEqual([
      "Row 2: cost is not exact to the cent",
      "Row 2: users[0].paid_share is not exact to the cent",
      "Row 2: users[0].owed_share is not exact to the cent",
    ])
    expect(result.expenses).toHaveLength(1)
  })

  test("a zero cost, another currency, shares that don't add up or a malformed row fail", () => {
    const result = plan(
      [
        row({ cost: "0.0", users: [user(ADA, 0, 0)] }),
        row({ currency_code: "EUR" }),
        row({ users: [user(ADA, 3_000, 1_000), user(BO, 0, 1_500)] }),
        row({ cost: 30, users: "nobody" }),
      ],
      new Map([
        [ADA, 0],
        [BO, 0],
        [CY, 0],
      ]),
    )
    expect(result.report.failures).toEqual([
      "Row 4: cost, users missing or not in the expected shape",
      "Row 1: cost is zero",
      "Row 2: currency_code is not USD",
      "Row 3: owed_share does not add up to cost",
    ])
    expect(result.expenses).toEqual([])
  })

  test("a zero share is no share on that side", () => {
    const result = plan([row({ users: [user(ADA, 3_000, 0), user(BO, 0, 3_000), user(CY, 0, 0)] })])
    expect(result.report.failures).toEqual([])
    const [expense] = result.expenses
    expect(expense?.paid).toEqual(exact({ "acct-ada": 3_000 }))
    expect(expense?.owed).toEqual(exact({ "acct-bo": 3_000 }))
    expect(expense?.paidShares).toEqual({ "acct-ada": 3_000 })
    expect(expense?.owedShares).toEqual({ "acct-bo": 3_000 })
  })

  test("a negative cost is a Refund, its inputs typed without a minus", () => {
    const result = plan([
      row({ cost: "-20.0", users: [user(ADA, -2_000, -1_000), user(BO, 0, -1_000)] }),
    ])
    expect(result.report.failures).toEqual([])
    expect(result.expenses[0]).toMatchObject({
      total: -2_000,
      paid: exact({ "acct-ada": 2_000 }),
      paidShares: { "acct-ada": -2_000 },
      owedShares: { "acct-ada": -1_000, "acct-bo": -1_000 },
    })
    expect(result.report.years.get("2025")).toEqual({ expenses: 0, refunds: 1, payments: 0 })
  })

  test("an empty description or one the form would refuse fails", () => {
    const result = plan(
      [row({ description: "  " }), row({ description: "x".repeat(201) })],
      new Map([
        [ADA, 0],
        [BO, 0],
        [CY, 0],
      ]),
    )
    expect(result.report.failures).toEqual([
      "Row 1: description is empty",
      "Row 2: description is over 200 characters",
    ])
  })
})

describe("the date", () => {
  test.each([
    // An evening in New York is already the next day in UTC.
    ["2025-03-15T03:30:00Z", "2025-03-14"],
    ["2025-03-15T04:00:00Z", "2025-03-15"],
    ["2025-07-15T03:59:59Z", "2025-07-14"],
    ["2025-07-15T04:00:00Z", "2025-07-15"],
    // Either side of the spring change (Mar 9) and the autumn one (Nov 2).
    ["2025-03-09T04:59:59Z", "2025-03-08"],
    ["2025-03-10T03:59:59Z", "2025-03-09"],
    ["2025-11-02T03:59:59Z", "2025-11-01"],
    ["2025-11-03T04:59:59Z", "2025-11-02"],
    ["2025-12-31T23:00:00+00:00", "2025-12-31"],
  ])("the UTC instant %s is %s in the household zone", (date, calendar) => {
    expect(plan([row({ date })]).expenses[0]?.date).toBe(calendar)
  })

  test("a date that isn't an instant fails", () => {
    const result = plan([row({ date: "2025-03-14" })])
    expect(result.report.failures).toContain("Row 1: date is not a UTC instant")
  })

  test("the year an entry counts in is its household date's", () => {
    const result = plan([row({ date: "2026-01-01T04:30:00Z" })])
    expect([...result.report.years.keys()]).toEqual(["2025"])
  })
})

describe("Categories", () => {
  test("the committed table maps Splitwise's 36 names onto the twelve", () => {
    expect(CATEGORY_MAP.size).toBe(36)
    expect(new Set(CATEGORY_MAP.values()).size).toBe(12)
    expect(mapCategory("Liquor")).toBe("Groceries")
    expect(mapCategory("TV/Phone/Internet")).toBe("Utilities")
    expect(mapCategory("Medical expenses")).toBe("Personal")
    expect(mapCategory("Gas/fuel")).toBe("Car")
    expect(mapCategory("Bus/train")).toBe("Travel")
  })

  test("each Expense lands in its mapped Category, counted and totalled per year", () => {
    const result = plan([
      row({ category: { id: 1, name: "Liquor" } }),
      row({ category: { id: 2, name: "Heat/gas" } }),
      row({ category: { id: 3, name: "Groceries" }, date: "2024-06-01T16:00:00Z" }),
    ])
    expect(result.report.failures).toEqual([])
    expect(result.expenses.map((expense) => expense.category)).toEqual([
      "Groceries",
      "Utilities",
      "Groceries",
    ])
    expect(result.report.categories).toEqual([
      { year: "2024", category: "Groceries", count: 1, total: 3_000 },
      { year: "2025", category: "Groceries", count: 1, total: 3_000 },
      { year: "2025", category: "Utilities", count: 1, total: 3_000 },
    ])
  })

  test("an unknown name fails without echoing it", () => {
    const result = plan(
      [row({ category: { id: 99, name: "Imaginary hobby" } }), row({ category: null })],
      new Map([
        [ADA, 0],
        [BO, 0],
        [CY, 0],
      ]),
    )
    expect(result.report.failures).toEqual([
      "Row 1: category.name is not in the Category mapping",
      "Row 2: category.name is not in the Category mapping",
    ])
    expect(formatReport(result).join("\n")).not.toContain("Imaginary hobby")
  })
})

describe("payment rows", () => {
  test("become Payments from whose Balance went up to whose went down, with no note", () => {
    const result = plan([row(), paymentRow(BO, ADA, 1_500, { date: "2025-04-01T02:00:00Z" })])
    expect(result.report.failures).toEqual([])
    expect(result.payments).toEqual([
      { row: 2, date: "2025-03-31", fromId: "acct-bo", toId: "acct-ada", amount: 1_500 },
    ])
    expect(result.expenses).toHaveLength(1)
    expect(result.report.years.get("2025")).toEqual({ expenses: 1, refunds: 0, payments: 1 })
    // Settled up, and Payments count in no Category.
    expect(result.report.members.map((member) => member.computed)).toEqual([0, 0, 0])
    expect(result.report.categories).toEqual([
      { year: "2025", category: "Groceries", count: 1, total: 3_000 },
    ])
  })

  test("one touching anything but exactly two members by equal and opposite amounts fails", () => {
    const result = plan(
      [
        paymentRow(BO, ADA, 1_500, {
          cost: "15.0",
          users: [user(BO, 1_500, 0), user(ADA, 0, 1_000), user(CY, 0, 500)],
        }),
        paymentRow(BO, ADA, 1_500, { users: [user(BO, 1_500, 1_500)] }),
      ],
      new Map([
        [ADA, 0],
        [BO, 0],
        [CY, 0],
      ]),
    )
    expect(result.report.failures).toEqual([
      "Row 1: users does not move exactly two members by equal and opposite amounts",
      "Row 2: users does not move exactly two members by equal and opposite amounts",
    ])
    expect(result.payments).toEqual([])
  })
})

describe("deleted rows", () => {
  test("are skipped and counted, whatever else they hold", () => {
    const result = plan([
      row(),
      row({ deleted_at: "2025-05-01T12:00:00Z", cost: "1.001", category: { name: "Imaginary" } }),
      paymentRow(ADA, BO, 500, { deleted_at: "2025-05-01T12:00:00Z" }),
    ])
    expect(result.report.failures).toEqual([])
    expect(result.report.rowsRead).toBe(3)
    expect(result.report.deleted).toBe(2)
    expect(result.expenses).toHaveLength(1)
    expect(result.payments).toEqual([])
    expect(formatReport(result)).toContain("Rows read: 3, deleted rows skipped: 2")
  })
})

describe("the mapping", () => {
  test("a user on a row or in the group that isn't mapped fails", () => {
    const stranger = 609
    const result = plan([
      row({ users: [user(ADA, 3_000, 0), user(BO, 0, 1_500), user(stranger, 0, 1_500)] }),
    ])
    expect(result.report.failures).toContain(
      "Group member 4 (in get_group order) is not in the mapping",
    )
    expect(result.report.failures).toContain("Row 1: users[2].user_id is not in the mapping")
    expect(result.expenses).toEqual([])
  })

  test("an email no Account has fails", () => {
    const result = planImport(
      snapshot([row()]),
      mapping,
      accounts.filter((account) => account.id !== "acct-bo"),
    )
    expect(result.report.failures).toContain("Mapping entry 2: no Account has that email")
    expect(result.report.failures).toContain("Row 1: users[1].user_id is not in the mapping")
  })

  test("two ids mapped to one Account fail", () => {
    const result = planImport(
      snapshot([row()]),
      [...mapping.slice(0, 2), { number: 3, splitwiseId: String(CY), email: "ada@example.com" }],
      accounts,
    )
    expect(result.report.failures).toContain("Mapping entries 1 and 3 map to the same Account")
  })

  test("an Account without App access is still mapped, landing as a Former member", () => {
    const result = plan([row({ users: [user(CY, 3_000, 0), user(ADA, 0, 3_000)] })])
    expect(result.report.failures).toEqual([])
    expect(result.expenses[0]?.paidShares).toEqual({ "acct-cy": 3_000 })
    expect(result.report.members.map((member) => member.access)).toEqual([true, true, false])
  })
})

describe("the Balance check", () => {
  test("every Member's computed Balance matching Splitwise's is no mismatch", () => {
    const result = plan([row(), row({ users: [user(BO, 3_000, 1_000), user(CY, 0, 2_000)] })])
    expect(result.report.members).toEqual([
      { number: 1, access: true, computed: 1_500, splitwise: 1_500 },
      { number: 2, access: true, computed: 500, splitwise: 500 },
      { number: 3, access: false, computed: -2_000, splitwise: -2_000 },
    ])
    expect(result.report.failures).toEqual([])
    expect(formatReport(result).at(-1)).toBe("No mismatches.")
  })

  test("a difference of one cent fails, naming the Member by number", () => {
    const result = plan(
      [row()],
      new Map([
        [ADA, 1_501],
        [BO, -1_501],
        [CY, 0],
      ]),
    )
    expect(result.report.failures).toEqual([
      "Member 1: the computed Balance differs from Splitwise's",
      "Member 2: the computed Balance differs from Splitwise's",
    ])
    const report = formatReport(result)
    expect(report).toContain("Failures:")
    expect(report.find((line) => line.trimStart().startsWith("1 "))).toMatch(/-\$0\.01\s+DIFFERS$/)
  })

  test("a group balance in another currency fails", () => {
    const file = snapshot([row()])
    const [first] = file.group.group.members
    if (first) first.balance = [{ currency_code: "EUR", amount: "15.0" }]
    const result = planImport(file, mapping, accounts)
    expect(result.report.failures).toContain(
      "Member 1: the Splitwise balance has a currency other than USD",
    )
  })
})

describe("the report", () => {
  test("never prints a name, email, description, note or Splitwise id", () => {
    const result = plan([row({ details: "Made-up note" }), paymentRow(BO, ADA, 1_500)])
    const report = formatReport(result).join("\n")
    for (const secret of [
      "Ada",
      "Bo ",
      "example.com",
      "acct-",
      "Made-up",
      String(ADA),
      String(nextId),
    ]) {
      expect(report).not.toContain(secret)
    }
    expect(report).toContain("To write: 1 Expenses and 1 Payments")
  })

  test("a file that isn't a snapshot is refused", () => {
    expect(() => planImport({ something: "else" }, mapping, accounts)).toThrow(SnapshotInvalid)
    expect(() =>
      planImport({ group: { group: { members: [] } }, expensePages: [{}] }, mapping, accounts),
    ).toThrow("Expense page 1 of the snapshot has no expenses list")
  })
})

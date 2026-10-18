// The import mapping on made-up extracts. Every payee, note and amount here is invented.
import { describe, expect, test } from "vitest"
import type {
  Extract,
  OldBalance,
  OldCategory,
  OldLedgerRow,
  OldSchedule,
  OldTransaction,
} from "./extract.ts"
import { planImport, type PlannedActual } from "./plan.ts"

const TODAY = "2026-10-18"

function category(id: string, name: string): OldCategory {
  return { id, name }
}

function schedule(id: string, changes: Partial<OldSchedule> = {}): OldSchedule {
  return { id, kind: "expense", name: `Schedule ${id}`, categoryId: null, ...changes }
}

function transaction(id: string, changes: Partial<OldTransaction> = {}): OldTransaction {
  return {
    id,
    kind: "expense",
    scheduleId: null,
    date: "2024-03-10",
    amountCents: 1000,
    note: null,
    pending: false,
    posted: true,
    ...changes,
  }
}

function ledger(id: string, changes: Partial<OldLedgerRow> = {}): OldLedgerRow {
  return {
    id,
    isExpense: true,
    transactionId: null,
    date: "2024-03-10",
    payee: null,
    amountCents: 1000,
    categoryId: null,
    note: null,
    bankDescription: null,
    bankDate: null,
    ...changes,
  }
}

function balance(id: string, enteredAt: string, amountCents: number): OldBalance {
  return { id, enteredAt, amountCents }
}

function extract(changes: Partial<Extract> = {}): Extract {
  return { categories: [], schedules: [], transactions: [], ledger: [], balances: [], ...changes }
}

function plan(changes: Partial<Extract> = {}) {
  return planImport(extract(changes), { today: TODAY })
}

function actualByKey(actuals: readonly PlannedActual[], key: string): PlannedActual {
  const found = actuals.find((a) => a.sourceKey === key)
  if (!found) throw new Error(`No Actual keyed ${key}`)
  return found
}

describe("ledger rows", () => {
  test("each ledger row becomes one Actual keyed ledger:<id>, an expense negative", () => {
    const result = plan({ ledger: [ledger("7", { amountCents: 1234, date: "2024-05-02" })] })
    expect(result.actuals).toEqual([
      expect.objectContaining({ sourceKey: "ledger:7", amountCents: -1234, date: "2024-05-02" }),
    ])
  })
})

describe("keys and amounts", () => {
  test("an income ledger row is money in, and a negative expense becomes money in", () => {
    const result = plan({
      ledger: [
        ledger("1", { isExpense: false, amountCents: 50000 }),
        ledger("2", { isExpense: true, amountCents: -1500 }),
      ],
    })
    expect(actualByKey(result.actuals, "ledger:1").amountCents).toBe(50000)
    expect(actualByKey(result.actuals, "ledger:2").amountCents).toBe(1500)
  })

  test("a transaction no ledger row points to becomes its own Actual, signed by its kind", () => {
    const result = plan({
      transactions: [
        transaction("4", { kind: "expense", amountCents: 2500 }),
        transaction("4", { kind: "income", amountCents: 9000 }),
      ],
    })
    expect(actualByKey(result.actuals, "expense:4").amountCents).toBe(-2500)
    expect(actualByKey(result.actuals, "income:4").amountCents).toBe(9000)
  })

  test("a linked transaction is carried by its ledger rows, one Actual per row of a split", () => {
    const result = plan({
      transactions: [
        transaction("9", { kind: "expense", amountCents: 3000 }),
        transaction("9", { kind: "income", amountCents: 3000 }),
      ],
      ledger: [
        ledger("1", { transactionId: "9", amountCents: 1000 }),
        ledger("2", { transactionId: "9", amountCents: 2000 }),
      ],
    })
    expect(result.actuals.map((a) => [a.sourceKey, a.amountCents])).toEqual([
      ["ledger:1", -1000],
      ["ledger:2", -2000],
      ["income:9", 3000],
    ])
  })
})

describe("dates", () => {
  test("the bank date wins, then the ledger date, then the linked transaction's date", () => {
    const result = plan({
      transactions: [transaction("5", { date: "2023-01-20" })],
      ledger: [
        ledger("1", { date: "2023-01-02", bankDate: "2023-01-04" }),
        ledger("2", { date: "2023-01-02" }),
        ledger("3", { date: null, transactionId: "5" }),
      ],
    })
    expect(actualByKey(result.actuals, "ledger:1").date).toBe("2023-01-04")
    expect(actualByKey(result.actuals, "ledger:2").date).toBe("2023-01-02")
    expect(actualByKey(result.actuals, "ledger:3").date).toBe("2023-01-20")
    expect(result.report.counted).toMatchObject({
      dateFromBankDate: 1,
      dateFromLedgerDate: 1,
      dateFromTransactionDate: 1,
    })
  })
})

describe("Categories", () => {
  const categories = [
    category("10", "Coffee Shops"),
    category("11", "Credit Cards"),
    category("12", "Savings"),
    category("13", "Paycheck"),
  ]

  test("a ledger row takes its own category, mapped to the new one", () => {
    const result = plan({
      categories,
      ledger: [
        ledger("1", { categoryId: "10" }),
        ledger("2", { categoryId: "11" }),
        ledger("3", { categoryId: "12" }),
        ledger("4", { categoryId: null }),
      ],
    })
    expect(result.actuals.map((a) => a.category)).toEqual([
      "Dining Out",
      "Card payments",
      null,
      null,
    ])
    expect(result.categories).toHaveLength(18)
    expect(result.categories).toContain("Card payments")
  })

  test("an unlinked transaction takes its Schedule's category", () => {
    const result = plan({
      categories,
      schedules: [schedule("3", { kind: "income", categoryId: "13" })],
      transactions: [transaction("8", { kind: "income", scheduleId: "3" })],
    })
    expect(actualByKey(result.actuals, "income:8").category).toBe("Paycheck")
  })

  test("an old category missing from the mapping fails the run, matched ignoring case", () => {
    const result = plan({
      categories: [category("1", "Lottery Winnings"), category("2", "  coffee shops ")],
      ledger: [ledger("1", { categoryId: "1" }), ledger("2", { categoryId: "2" })],
    })
    expect(result.report.failures).toEqual(["Old category not in the mapping: Lottery Winnings"])
    expect(actualByKey(result.actuals, "ledger:2").category).toBe("Dining Out")
  })
})

describe("Accounts and notes", () => {
  test("the linked Schedule's name is the Account", () => {
    const result = plan({
      schedules: [schedule("2", { name: " Corner Utility Co " })],
      transactions: [transaction("6", { scheduleId: "2" }), transaction("7", { scheduleId: "2" })],
      ledger: [ledger("1", { transactionId: "6", payee: "Someone Else" })],
    })
    expect(actualByKey(result.actuals, "ledger:1").account).toBe("Corner Utility Co")
    expect(actualByKey(result.actuals, "expense:7").account).toBe("Corner Utility Co")
    expect(result.accounts).toEqual(["Corner Utility Co"])
  })

  test("a payee on 5 or more rows becomes an Account, compared trimmed and ignoring case", () => {
    const spellings = ["Maple Diner", "maple diner", " MAPLE DINER", "Maple Diner ", "Maple diner"]
    const result = plan({
      ledger: spellings.map((payee, index) => ledger(String(index), { payee })),
    })
    expect(result.accounts).toEqual(["Maple Diner"])
    expect(new Set(result.actuals.map((a) => a.account))).toEqual(new Set(["Maple Diner"]))
  })

  test("a rarer payee goes into the note, before the ledger and transaction notes", () => {
    const result = plan({
      transactions: [transaction("6", { note: "second half" })],
      ledger: [
        ledger("1", { payee: "Pine Bakery", note: "birthday cake", transactionId: "6" }),
        ledger("2", { note: "  " }),
      ],
    })
    expect(actualByKey(result.actuals, "ledger:1")).toMatchObject({
      account: null,
      note: "Pine Bakery · birthday cake · second half",
    })
    expect(actualByKey(result.actuals, "ledger:2").note).toBe("")
    expect(result.report.counted.payeesMovedToNotes).toBe(1)
  })

  test("the bank description comes from the ledger row", () => {
    const result = plan({ ledger: [ledger("1", { bankDescription: "POS 1234 MADE UP MART" })] })
    expect(result.actuals[0]?.bankDescription).toBe("POS 1234 MADE UP MART")
  })
})

describe("skipped rows", () => {
  test("zero amounts, the impossible year and generated future rows drop, counted by reason", () => {
    const result = plan({
      transactions: [
        transaction("1", { date: "2027-01-01" }),
        transaction("2", { amountCents: 0 }),
        transaction("3", { date: TODAY }),
      ],
      ledger: [ledger("1", { date: "0425-06-01" }), ledger("2", { amountCents: 0 })],
    })
    expect(result.actuals.map((a) => a.sourceKey)).toEqual(["expense:3"])
    expect(Object.fromEntries(result.report.skipped)).toEqual({
      "transactions: generated future row": 1,
      "transactions: zero amount": 1,
      "ledger: impossible date": 1,
      "ledger: zero amount": 1,
    })
    expect(result.report.failures).toEqual([])
  })

  test("stale pending rows come in as ordinary Actuals", () => {
    const result = plan({ transactions: [transaction("1", { pending: true, posted: false })] })
    expect(result.actuals.map((a) => a.sourceKey)).toEqual(["expense:1"])
  })

  test("rows read, written and skipped are counted per table and year", () => {
    const result = plan({
      transactions: [
        transaction("1", { date: "2023-02-01" }),
        transaction("2", { date: "2024-02-01" }),
      ],
      ledger: [
        ledger("1", { date: "2023-12-31", bankDate: "2024-01-02", transactionId: "1" }),
        ledger("2", { date: "2024-05-05", amountCents: 0 }),
      ],
    })
    expect(Object.fromEntries(result.report.years.ledger)).toEqual({
      "2023": { read: 1, written: 1, skipped: 0 },
      "2024": { read: 1, written: 0, skipped: 1 },
    })
    expect(Object.fromEntries(result.report.years.transactions)).toEqual({
      "2023": { read: 1, written: 0, skipped: 1 },
      "2024": { read: 1, written: 1, skipped: 0 },
    })
    expect(result.report.skipped.get("transactions: carried by its ledger rows")).toBe(1)
  })

  test("a transaction whose ledger rows don't add up to it is counted, not failed", () => {
    const result = plan({
      transactions: [
        transaction("1", { amountCents: 3000 }),
        transaction("2", { amountCents: 500 }),
      ],
      ledger: [
        ledger("1", { transactionId: "1", amountCents: 1000 }),
        ledger("2", { transactionId: "1", amountCents: 1500 }),
        ledger("3", { transactionId: "2", amountCents: 500 }),
      ],
    })
    expect(result.report.counted.linkedSumsDiffer).toBe(1)
    expect(result.report.failures).toEqual([])
  })
})

describe("Balance checks", () => {
  test("each day's last entry is that day's Balance check on Checking", () => {
    const result = plan({
      balances: [
        balance("1", "2024-02-01T09:00:00", 10000),
        balance("2", "2024-02-01T21:30:00", 12000),
        balance("3", "2024-02-01T13:00:00", 11000),
        balance("4", "2024-02-02T08:00:00", -500),
      ],
    })
    expect(result.balanceChecks).toEqual([
      { date: "2024-02-01", amountCents: 12000 },
      { date: "2024-02-02", amountCents: -500 },
    ])
    expect(result.wallet).toEqual({ name: "Checking", inForecast: true })
    expect(result.report.years.balances.get("2024")).toEqual({ read: 4, written: 2, skipped: 2 })
  })
})

describe("failures", () => {
  test("two Actuals with the same import key fail the run", () => {
    const result = plan({ ledger: [ledger("1"), ledger("1")] })
    expect(result.report.failures).toEqual(["1 import keys would be used more than once"])
  })

  test("old and new monthly Category totals sit side by side and agree", () => {
    const result = plan({
      categories: [category("1", "Groceries"), category("2", "Paycheck")],
      schedules: [schedule("1", { kind: "income", categoryId: "2" })],
      transactions: [
        transaction("1", {
          kind: "income",
          scheduleId: "1",
          date: "2024-01-15",
          amountCents: 200000,
        }),
      ],
      ledger: [
        ledger("1", {
          categoryId: "1",
          date: "2024-01-31",
          bankDate: "2024-02-01",
          amountCents: 4000,
        }),
        ledger("2", { categoryId: "1", date: "2024-01-03", amountCents: 1000 }),
      ],
    })
    expect(result.report.categoryTotals).toEqual([
      { month: "2024-01", category: "Groceries", oldCents: -1000, newCents: -1000 },
      { month: "2024-01", category: "Paycheck", oldCents: 200000, newCents: 200000 },
      { month: "2024-02", category: "Groceries", oldCents: -4000, newCents: -4000 },
    ])
    expect(result.report.failures).toEqual([])
  })
})

describe("a transaction whose only ledger row is skipped", () => {
  test("stays carried by that row and is counted as not adding up", () => {
    const result = plan({
      transactions: [transaction("1", { amountCents: 700 })],
      ledger: [ledger("1", { transactionId: "1", amountCents: 0 })],
    })
    expect(result.actuals).toEqual([])
    expect(result.report.counted.linkedSumsDiffer).toBe(1)
  })
})

describe("an impossible bank posting date", () => {
  test("falls back to the ledger date, then the linked transaction's, and is counted", () => {
    const result = plan({
      transactions: [transaction("5", { date: "2023-03-09" })],
      ledger: [
        ledger("1", { date: "2023-03-01", bankDate: "0202-03-02" }),
        ledger("2", { date: null, bankDate: "0202-03-02", transactionId: "5" }),
      ],
    })
    expect(actualByKey(result.actuals, "ledger:1").date).toBe("2023-03-01")
    expect(actualByKey(result.actuals, "ledger:2").date).toBe("2023-03-09")
    expect(result.report.counted).toMatchObject({
      impossibleBankDateFellBack: 2,
      dateFromBankDate: 0,
      dateFromLedgerDate: 1,
      dateFromTransactionDate: 1,
    })
    expect([...result.report.skipped.keys()]).toEqual(["transactions: carried by its ledger rows"])
    expect(result.report.failures).toEqual([])
  })

  test("drops the row only when no other date is possible either", () => {
    const result = plan({
      transactions: [transaction("5", { date: "0425-01-01" })],
      ledger: [
        ledger("1", { date: null, bankDate: "0202-03-02", transactionId: "5" }),
        ledger("2", { date: "0425-06-01", bankDate: null }),
        ledger("3", { date: "0425-06-01", bankDate: "2024-06-02" }),
      ],
    })
    expect(result.actuals.map((a) => [a.sourceKey, a.date])).toEqual([["ledger:3", "2024-06-02"]])
    expect(result.report.skipped.get("ledger: impossible date")).toBe(2)
    expect(result.report.counted.impossibleBankDateFellBack).toBe(0)
    expect(result.report.failures).toEqual([])
  })
})

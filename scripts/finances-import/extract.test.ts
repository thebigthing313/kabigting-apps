// Parsing the normalised extract. Every value here is made up.
import { describe, expect, test } from "vitest"
import { ExtractError, parseExtract } from "./extract.ts"

const empty = { categories: [], schedules: [], transactions: [], ledger: [], balances: [] }

function parseBadBalance() {
  return parseExtract({
    ...empty,
    balances: [{ id: 1, enteredAt: "2022-01-01", amount: "12.345" }],
  })
}

describe("parseExtract", () => {
  test("turns ids into strings, amounts into cents and timestamps into dates", () => {
    const extract = parseExtract({
      ...empty,
      transactions: [
        {
          id: 41,
          kind: "income",
          scheduleId: 3,
          date: "2022-07-01T00:00:00",
          amount: 1250.5,
          note: null,
          pending: false,
          posted: true,
        },
      ],
      ledger: [
        {
          id: "9",
          isExpense: 1,
          transactionId: null,
          date: "2022-07-02",
          payee: "Made Up Market",
          amount: "-3.10",
          categoryId: 4,
          note: "",
          bankDescription: null,
          bankDate: "",
        },
      ],
      balances: [{ id: 2, enteredAt: "2022-07-02T18:45:10", amount: "-20.00" }],
    })
    expect(extract.transactions).toEqual([
      {
        id: "41",
        kind: "income",
        scheduleId: "3",
        date: "2022-07-01",
        amountCents: 125050,
        note: null,
        pending: false,
        posted: true,
      },
    ])
    expect(extract.ledger[0]).toMatchObject({
      id: "9",
      isExpense: true,
      categoryId: "4",
      amountCents: -310,
      bankDate: null,
    })
    expect(extract.balances).toEqual([
      { id: "2", enteredAt: "2022-07-02T18:45:10", amountCents: -2000 },
    ])
  })

  test("names the file, row and field of a bad value without echoing it", () => {
    expect(parseBadBalance).toThrow(ExtractError)
    expect(parseBadBalance).toThrow(/balances\.json.*\n.*row 0, amount/)
    expect(parseBadBalance).not.toThrow(/12\.345/)
  })

  test("refuses a file that is not an array", () => {
    expect(() => parseExtract({ ...empty, ledger: {} })).toThrow("ledger.json is not a JSON array")
  })
})

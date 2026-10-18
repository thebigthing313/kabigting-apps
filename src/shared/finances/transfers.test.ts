import { describe, expect, test } from "vitest"
import { transferAmountOn } from "./transfers.ts"

const transfer = { fromWalletId: "checking", toWalletId: "card", amountCents: 25_000 }

describe("transferAmountOn", () => {
  test("takes the amount out of the from Wallet", () => {
    expect(transferAmountOn(transfer, "checking")).toBe(-25_000)
  })

  test("adds the amount to the to Wallet", () => {
    expect(transferAmountOn(transfer, "card")).toBe(25_000)
  })

  test("does not move any other Wallet", () => {
    expect(transferAmountOn(transfer, "savings")).toBe(0)
  })
})

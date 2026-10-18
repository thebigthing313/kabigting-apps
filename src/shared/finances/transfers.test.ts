import { describe, expect, test } from "vitest"
import { onlySideArrived, transferAmountOn } from "./transfers.ts"

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

describe("onlySideArrived", () => {
  const waiting = {
    status: "actual" as const,
    ignored: false,
    fromSource: "ofx" as const,
    toSource: null,
  }

  test("names the one side a bank line keyed, while the other waits", () => {
    expect(onlySideArrived(waiting)).toBe("from")
    expect(onlySideArrived({ ...waiting, fromSource: null, toSource: "ofx" })).toBe("to")
    expect(onlySideArrived({ ...waiting, fromSource: "access" })).toBe("from")
  })

  test("is null once both sides arrived, or for a Transfer entered by hand", () => {
    expect(onlySideArrived({ ...waiting, toSource: "ofx" })).toBeNull()
    expect(onlySideArrived({ ...waiting, fromSource: "manual", toSource: "manual" })).toBeNull()
  })

  test("is null for a Planned Transfer or an ignored one", () => {
    expect(onlySideArrived({ ...waiting, status: "planned", fromSource: null })).toBeNull()
    expect(onlySideArrived({ ...waiting, ignored: true })).toBeNull()
  })
})

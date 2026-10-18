import { describe, expect, test } from "vitest"
import { ALL_TAB, selectedTab } from "@/apps/finances/home/home-tab"

const forecastWalletIds = ["checking", "card"]

describe("selectedTab", () => {
  test("with no tab in the address, home opens on the household's default", () => {
    expect(selectedTab({ tab: undefined, openOnHome: "card", forecastWalletIds })).toBe("card")
    expect(selectedTab({ tab: undefined, openOnHome: null, forecastWalletIds })).toBe(ALL_TAB)
  })

  test("a tab in the address wins over the default", () => {
    expect(selectedTab({ tab: "checking", openOnHome: "card", forecastWalletIds })).toBe("checking")
    expect(selectedTab({ tab: ALL_TAB, openOnHome: "card", forecastWalletIds })).toBe(ALL_TAB)
  })

  test("a Wallet no longer in the forecast falls back to the default, then to All", () => {
    expect(selectedTab({ tab: "savings", openOnHome: "card", forecastWalletIds })).toBe("card")
    expect(selectedTab({ tab: "savings", openOnHome: "savings", forecastWalletIds })).toBe(ALL_TAB)
    expect(selectedTab({ tab: undefined, openOnHome: "savings", forecastWalletIds })).toBe(ALL_TAB)
  })
})

/** The All tab's value in `?wallet=`; any other value is a Wallet's id. */
export const ALL_TAB = "all"

/**
 * Which home tab is showing: the one in the address, else the household's "Open here by
 * default" choice, else All. A Wallet that is no longer in the forecast has no tab, so it falls
 * through to the next choice.
 */
export function selectedTab({
  tab,
  openOnHome,
  forecastWalletIds,
}: {
  /** `?wallet=`: ALL_TAB, a Wallet's id, or nothing. */
  tab: string | undefined
  /** The household's default Wallet; null means All. */
  openOnHome: string | null
  forecastWalletIds: readonly string[]
}): string {
  for (const choice of [tab, openOnHome]) {
    if (choice === ALL_TAB) return ALL_TAB
    if (choice != null && forecastWalletIds.includes(choice)) return choice
  }
  return ALL_TAB
}

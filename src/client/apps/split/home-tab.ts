/** The tabs on Split's Home, in the order they show. Activity is first and opens by default. */
export const HOME_TABS = ["activity", "balances", "spending"] as const
export type HomeTab = (typeof HOME_TABS)[number]

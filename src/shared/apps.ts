/** Every App the Shell hosts: the key used by App access and App routers, and its title. */
export const APPS = [{ key: "finances", title: "Finances" }] as const

export type AppKey = (typeof APPS)[number]["key"]

export const APP_KEYS: readonly AppKey[] = APPS.map((app) => app.key)

export function isAppKey(value: string): value is AppKey {
  return APP_KEYS.some((key) => key === value)
}

export function appTitle(key: AppKey): string {
  return APPS.find((app) => app.key === key)?.title ?? key
}

/** Every App the Shell hosts. `app_access` rows and App routers use these keys. */
export const APP_KEYS = ["skeleton"] as const

export type AppKey = (typeof APP_KEYS)[number]

export function isAppKey(value: string): value is AppKey {
  return APP_KEYS.some((key) => key === value)
}

import { createMiddleware } from "hono/factory"

/** Every response names its build so a client can spot a newer deploy. */
export function appVersionHeader(appVersion: string) {
  return createMiddleware(async (c, next) => {
    await next()
    c.header("X-App-Version", appVersion)
  })
}

/** API responses are private and live: never cached anywhere. */
export const noStore = createMiddleware(async (c, next) => {
  await next()
  c.header("Cache-Control", "no-store")
})

export const NO_CACHE = "no-cache"
export const IMMUTABLE = "public, max-age=31536000, immutable"

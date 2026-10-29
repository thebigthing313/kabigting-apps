// The one client file allowed to import from the server, and only types: Hono's typed client
// gives every call the route's request and response types.
import { hc } from "hono/client"
import type { WriteOptions } from "@/data/collection-factory"
import { apiFetch } from "@/data/error-handler"
import type { AppType } from "../../server/app.ts"

export const api = hc<AppType>("/", { fetch: apiFetch }).api

/**
 * Browsers refuse a `keepalive` request once the bodies of all those in flight pass 64 KiB, so
 * keep the total under it, with room to spare.
 */
const KEEPALIVE_BUDGET = 60 * 1024
let keepaliveInFlight = 0

/**
 * Sends a write whose JSON body is `json`, with keepalive when asked and while the bodies of the
 * keepalive requests in flight, this one included, fit the browser's budget; otherwise as an
 * ordinary request.
 */
export async function sendWrite<T>(
  options: WriteOptions,
  json: unknown,
  request: (init: { init: RequestInit } | undefined) => Promise<T>,
): Promise<T> {
  if (!options.keepalive) return request(undefined)
  const size = new TextEncoder().encode(JSON.stringify(json)).byteLength
  if (keepaliveInFlight + size > KEEPALIVE_BUDGET) return request(undefined)
  keepaliveInFlight += size
  try {
    return await request({ init: { keepalive: true } })
  } finally {
    keepaliveInFlight -= size
  }
}

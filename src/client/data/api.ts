// The one client file allowed to import from the server, and only types: Hono's typed client
// gives every call the route's request and response types.
import { hc } from "hono/client"
import type { WriteOptions } from "@/data/collection-factory"
import { apiFetch } from "@/data/error-handler"
import type { AppType } from "../../server/app.ts"

export const api = hc<AppType>("/", { fetch: apiFetch }).api

/**
 * Browsers refuse a `keepalive` request once the bodies of those in flight pass 64 KiB in all, so
 * stay well under it; a larger body goes as an ordinary request.
 */
const KEEPALIVE_BODY_LIMIT = 32 * 1024

/** The request options for a write whose JSON body is `json`, sent with keepalive when asked. */
export function sendOptions(options: WriteOptions, json: unknown) {
  if (!options.keepalive) return undefined
  const size = new TextEncoder().encode(JSON.stringify(json)).byteLength
  return size <= KEEPALIVE_BODY_LIMIT ? { init: { keepalive: true } } : undefined
}

// The one client file allowed to import from the server, and only types: Hono's typed client
// gives every call the route's request and response types.
import { hc } from "hono/client"
import type { AppType } from "../../server/app.ts"

export const api = hc<AppType>("/", { init: { credentials: "same-origin" } }).api

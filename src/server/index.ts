// Production and development entry: parse the environment, wire the app, listen.
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { serve } from "@hono/node-server"
import { z } from "zod"
import { createApp } from "#server/app.ts"
import { createAuth } from "#server/auth/auth.ts"
import { createDb } from "#server/db/client.ts"
import { parseEnv } from "#server/env.ts"

const env = parseEnv(process.env)
const { db, pool } = createDb(env.DATABASE_URL)
const auth = createAuth({ db, baseURL: env.BASE_URL, secret: env.BETTER_AUTH_SECRET })

// In development Vite serves the SPA; in production Hono serves the build from one origin.
const staticRoot =
  env.NODE_ENV === "development"
    ? undefined
    : fileURLToPath(new URL("../../dist/client", import.meta.url))

/** The build ID the client compares against `X-App-Version`; written by the Vite build. */
async function readAppVersion(root: string | undefined): Promise<string> {
  if (!root) return "dev"
  try {
    const file: unknown = JSON.parse(await readFile(`${root}/version.json`, "utf8"))
    return z.object({ version: z.string() }).parse(file).version
  } catch {
    return "unknown"
  }
}

const app = createApp({ db, auth, appVersion: await readAppVersion(staticRoot), staticRoot })
const server = serve({ fetch: app.fetch, port: env.PORT }, ({ port }) => {
  console.log(`API listening on http://localhost:${port}`)
})

// Railway sends SIGTERM on redeploy: stop accepting requests, then close the pool.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    server.close(() => void pool.end())
  })
}

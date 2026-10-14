// Serves the built SPA. Hono's serveStatic sets no cache headers, so they are set here: the shell
// files are revalidated on every load (so a deploy is seen), hashed assets are cached forever.
import { readFile } from "node:fs/promises"
import { join, relative } from "node:path"
import { serveStatic } from "@hono/node-server/serve-static"
import type { Env, Hono } from "hono"
import { IMMUTABLE, NO_CACHE } from "#server/core/cache-headers.ts"

export function serveSpa<E extends Env>(app: Hono<E>, staticRoot: string): void {
  // serveStatic resolves `root` against the working directory.
  const root = relative(process.cwd(), staticRoot) || "."

  app.use("*", async (c, next) => {
    await next()
    if (c.res.ok)
      c.header("Cache-Control", c.req.path.startsWith("/assets/") ? IMMUTABLE : NO_CACHE)
  })
  app.use("*", serveStatic({ root }))
  // A missing hashed asset is a real 404, never the shell.
  app.get("/assets/*", (c) => c.notFound())
  // Any other GET is a client-side route: answer with the shell.
  app.get("*", async (c) => c.html(await readFile(join(staticRoot, "index.html"), "utf8")))
}

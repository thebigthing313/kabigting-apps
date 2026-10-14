// Config the Better Auth CLI reads to generate src/server/db/schema/auth.ts. It never connects.
import { createAuth } from "#server/auth/auth.ts"
import { createDb } from "#server/db/client.ts"

export const auth = createAuth({
  // A pool connects lazily, so nothing touches this URL.
  db: createDb("postgres://localhost/schema-generation-only").db,
  baseURL: "http://localhost:3000",
  secret: "schema-generation-only-not-a-secret",
})

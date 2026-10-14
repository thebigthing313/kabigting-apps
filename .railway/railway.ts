// Railway Infrastructure as Code (railway.json is deprecated and stops being read 2026-12-01).
// Applied by hand from a linked checkout: `railway config plan`, then `railway config apply`.
// No secret values live here: secrets are set (sealed) in the dashboard and kept with preserve().
//
// Set in the dashboard, not here:
// - the GitHub source (repo connection, "wait for GitHub checks") and the generated domain;
// - the Postgres service's major version (created as Postgres 18) and its backup schedules;
// - BETTER_AUTH_SECRET (sealed) and BASE_URL (https://<generated domain>).
import { defineRailway, postgres, preserve, project, service } from "railway/iac"

export default defineRailway(() => {
  // Must match the name of the Postgres service created in the dashboard, so that `plan`
  // adopts it instead of creating a second database.
  const db = postgres("Postgres")

  const app = service("kabigting-apps", {
    // Railpack (the default builder) detects Node 24 from engines/.nvmrc and pnpm from the
    // packageManager field.
    build: { builder: "RAILPACK", buildCommand: "pnpm build" },
    start: "node src/server/index.ts",
    // Runs in its own container with the service's variables; a failure stops the deploy and
    // the previous deployment keeps serving.
    preDeploy: "node src/server/db/migrate.ts",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    // Railway's edge cache must stay off (it is off by default): the app sets its own cache
    // headers and a cached sw.js or index.html would pin old builds. The SDK's `cdn` field is
    // not accepted by CLI 5.68.0, so this is checked in the dashboard instead.
    env: {
      DATABASE_URL: db.env.DATABASE_URL,
      BETTER_AUTH_SECRET: preserve(),
      BASE_URL: preserve(),
      NODE_ENV: "production",
      // Hono serves the built SPA; stop Railpack from serving dist/ itself with Caddy.
      RAILPACK_NO_SPA: "1",
    },
  })

  return project("kabigting-apps", { resources: [db, app] })
})

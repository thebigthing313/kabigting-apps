# Research: Railway single-service deploy (Hono API + Vite assets + Postgres)

Ticket: [03-railway-single-service](../issues/03-railway-single-service.md)
Researched: 2026-10-14. Sources are docs.railway.com, railpack.com, and railway.com/changelog, fetched on that date.

## Headline finding

Config as Code (`railway.json` / `railway.toml`) is **deprecated**. New services in new projects stopped using it on 2026-08-28, and existing files stop being read on **2026-12-01** ([Config as Code reference](https://docs.railway.com/config-as-code/reference), [Changelog #0304](https://railway.com/changelog/2026-08-20-railway-anon)). Its replacement is Infrastructure as Code, `.railway/railway.ts`, which is generally available ([IaC](https://docs.railway.com/infrastructure-as-code)). The scaffold should use IaC or dashboard settings, not `railway.json`.

## Recommended shape (derived from the sources below)

- One service from the repo root, built by Railpack (the default builder).
- A `package.json` `build` script (Vite build, then anything the server needs) and a `start` script that runs the Hono server. The server serves `/api/*` and the `dist` assets itself.
- Set `RAILPACK_NO_SPA=1` or give an explicit start command so Railpack's Caddy static serving does not take over (see Build).
- Postgres from Railway's Postgres service, referenced as `DATABASE_URL` over the private network.
- Migrations as the pre-deploy command, a `/health` healthcheck, and a staging environment duplicated from production.

## Build and start (Railpack)

- Railpack is the default builder (`build.builder` is `RAILPACK`; a Dockerfile in the repo wins if present) ([config reference](https://docs.railway.com/config-as-code/reference)).
- Node is detected when a root `package.json` exists ([Railpack Node](https://railpack.com/languages/node)).
- Node version resolution, first match wins: `RAILPACK_NODE_VERSION`, `devEngines.runtime`, `engines.node`, `.nvmrc`, `.node-version`, `mise.toml`/`.tool-versions`. The default is `lts`. Pin `engines.node` for toolchain pinning ([Railpack Node](https://railpack.com/languages/node)).
- Package manager resolution: the `packageManager` field first, then lockfiles, then npm. The page confirms Corepack for npm/Yarn only; it does not confirm pnpm via Corepack, so verify in the first build ([Railpack Node](https://railpack.com/languages/node)).
- Build runs the `build` script if defined. Start resolves to the `start` script, then `main`, then a root `index.js`/`index.ts` ([Railpack Node](https://railpack.com/languages/node)).
- Gotcha: a Vite project is auto-detected as a static SPA and served with Caddy, with output from `dist` (override `RAILPACK_SPA_OUTPUT_DIR`). Disable with `RAILPACK_NO_SPA=1` or a custom start command. The server is Hono, so a `start` script is required ([Railpack Node](https://railpack.com/languages/node)). Whether a `start` script alone suppresses SPA mode is not stated; set `RAILPACK_NO_SPA=1` to be safe.
- Railpack sets `NODE_ENV=production` at runtime and `CI=true` ([Railpack Node](https://railpack.com/languages/node)).
- Overrides via `railpack.json` (`steps`, `deploy.startCommand`, `packages`) are available if needed ([Railpack config file](https://railpack.com/config/file)).

## Configuration mechanism (IaC)

- File: `.railway/railway.ts`, with `defineRailway`, `project`, `service` from `"railway/iac"`. Commands: `railway config init | pull | plan | apply | migrate` ([IaC](https://docs.railway.com/infrastructure-as-code), [CLI](https://docs.railway.com/cli/config)).
- Service keys documented: `build`, `start`, `preDeploy` (e.g. `"npx drizzle-kit migrate"`), `healthcheck` with optional `healthcheckTimeout`, `env`, `domains` ([IaC reference](https://docs.railway.com/infrastructure-as-code/reference)).
- Postgres is a top-level helper: `const db = postgres("postgres")`, then `env: { DATABASE_URL: db.env.DATABASE_URL }` ([IaC reference](https://docs.railway.com/infrastructure-as-code/reference)).
- Generated Railway domains are NOT represented in the IaC file ([IaC reference](https://docs.railway.com/infrastructure-as-code/reference)). They are a dashboard or CLI step.
- `builder` and `restart` have no documented IaC key. Keep the default Railpack builder.
- A service cannot be managed by both systems; `plan` stops if `railway.json` still manages it ([IaC](https://docs.railway.com/infrastructure-as-code)).
- CI: the `railwayapp/config` GitHub Action posts plan comments on PRs and applies on merge. Token type for apply (`RAILWAY_API_TOKEN` vs environment-scoped `RAILWAY_TOKEN`) is not stated on the CLI page; confirm on the "Apply from GitHub Actions" page, which was not fetched ([CLI](https://docs.railway.com/cli/config)).
- `init` and `pull` change nothing; only `apply` changes resources ([CLI](https://docs.railway.com/cli/config)). First-time bootstrap (creating the project) is therefore a human or CLI step.

## Generated domain

- Format `*.up.railway.app`. Services do not get one automatically: Service Settings, Networking, Public Networking, Generate Domain. Railway auto-detects a single listening port as the target port ([domains](https://docs.railway.com/networking/domains/working-with-domains)).
- Unavailable if the service has a TCP Proxy ([domains](https://docs.railway.com/networking/domains/working-with-domains)).
- Persistence across redeploys is not stated in the docs. Verify.
- Railway injects `PORT`; the app must listen on it (or the target port set to match) ([healthchecks](https://docs.railway.com/deployments/healthchecks)).
- Proxy headers: `X-Forwarded-Proto` is always `https`; `X-Forwarded-Host` and `X-Real-IP` are passed. HTTP/2 supported. Requests time out after 5 min idle, 15 min max ([specs and limits](https://docs.railway.com/networking/public-networking/specs-and-limits)).

## Pre-deploy migrations

- Runs between build and deploy, in a separate container inside the private network, with the service's environment variables. Filesystem changes are not kept and volumes are not mounted ([pre-deploy](https://docs.railway.com/deployments/pre-deploy-command)).
- Exit 0 passes. Any non-zero exit fails the deployment, with no retry ([pre-deploy](https://docs.railway.com/deployments/pre-deploy-command)). The previous deployment keeps serving (inference from the switchover model in [healthchecks](https://docs.railway.com/deployments/healthchecks)).
- No timeout by default; settable 1 to 3600 seconds ([pre-deploy](https://docs.railway.com/deployments/pre-deploy-command)).
- Dependencies must be in the built image. Railpack sets `NPM_CONFIG_PRODUCTION=false`, so dev dependencies are installed and the ORM CLI can live in devDependencies ([pre-deploy](https://docs.railway.com/deployments/pre-deploy-command), [Railpack Node](https://railpack.com/languages/node)).
- Config-as-code field was `deploy.preDeployCommand` (array); IaC field is `preDeploy` ([config reference](https://docs.railway.com/config-as-code/reference), [IaC reference](https://docs.railway.com/infrastructure-as-code/reference)).
- Migrations should be backward-compatible with the running version, since the old deployment keeps serving during migration and overlap (inference).

## Environments and staging

- New Environment: Duplicate or Empty. Duplicate copies services, variables and config, and all services are staged for review before deploy ([environments](https://docs.railway.com/environments)).
- A persistent staging environment can auto-deploy from a `staging` branch. PR environments are temporary, created per PR and deleted on merge or close; they get generated domains only if the base environment uses Railway-provided domains ([environments](https://docs.railway.com/environments)).
- Variables are scoped per environment, so each environment has its own Postgres service and data.
- Cost is not covered by the environments page. Usage pricing is per resource ($10/GB RAM/month, $20/vCPU/month, $0.15/GB volume/month, $0.05/GB egress), so a second environment roughly doubles baseline cost ([pricing](https://docs.railway.com/pricing/plans)).
- Plans: Free $0 with $1 credit and 0.5 GB / 1 vCPU max per service; Hobby $5/month with $5 usage; Pro $20/month. Free and Trial volume data is deleted 30 days after expiry ([pricing](https://docs.railway.com/pricing/plans)). Real-data Postgres should not sit on Free or Trial.
- Sealed variables are NOT copied into duplicated or PR environments ([variables](https://docs.railway.com/variables)). Staging needs its own secrets.

## Secrets and variables

- Reference syntax `${{ Postgres.DATABASE_URL }}` (service name + variable) and `${{ shared.KEY }}` for shared variables ([variables](https://docs.railway.com/variables)).
- Sealed variables: never visible in the UI or API again, cannot be unsealed, excluded from `railway variables`/`railway run`, not copied to duplicates ([variables](https://docs.railway.com/variables)). Suitable for `BETTER_AUTH_SECRET`; set via the dashboard.
- IaC `preserve()` keeps an existing value so secrets need not live in the repo ([IaC reference](https://docs.railway.com/infrastructure-as-code/reference)).
- Variables are exposed at build time and runtime. Changes are staged until deployed ([variables](https://docs.railway.com/variables)).
- Provided vars include `RAILWAY_PUBLIC_DOMAIN` and `RAILWAY_PRIVATE_DOMAIN` ([variables](https://docs.railway.com/variables)); useful for the Better Auth base URL.

## Postgres

- Added as a service from the template; SSL-enabled image built on the official Docker image. Exposes `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `DATABASE_URL`. Private by default; `DATABASE_PUBLIC_URL` exists only after enabling Public Access (TCP Proxy, egress billed) ([Postgres](https://docs.railway.com/databases/postgresql)).
- The default Postgres major version is not stated on the docs page; check the deployed image.
- Major upgrades can be done in place with preflight, automatic backup and one-click revert ([Postgres](https://docs.railway.com/databases/postgresql)).

## Backups and restore

- Native Backups apply to volumes, covering Railway database offerings and other volume data ([volume backups](https://docs.railway.com/volumes/backups)).
- Schedules: daily (kept 6 days), weekly (27 days), monthly (89 days); multiple per volume; manual backups allowed ([volume backups](https://docs.railway.com/volumes/backups)).
- Billing: incremental, copy-on-write, charged at volume rates for exclusive data ([volume backups](https://docs.railway.com/volumes/backups)).
- Restore: pick the backup in the Backups tab, Restore, review the staged change, Deploy. A new volume is mounted; the old one stays unmounted in the project. Restore works only within the same project and environment ([volume backups](https://docs.railway.com/volumes/backups)).
- Caveats: wiping a volume deletes its backups. Manual backups cannot exceed 50% of volume size. The page does not state plan availability or crash-consistency for Postgres, and does not mention `pg_dump`. Because backups live inside the project, an off-platform `pg_dump` (via `DATABASE_PUBLIC_URL`) would be a separate design choice for the backups ticket; no Railway source covers it.

## Healthchecks

- Set a path (e.g. `/health`) returning 2xx. Railway polls it during deployment and switches traffic only after success. Default timeout 300 s, configurable (`healthcheckTimeout`, or `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`) ([healthchecks](https://docs.railway.com/deployments/healthchecks)).
- Requests come from host `healthcheck.railway.app`; any host allow-list in the server must accept it ([healthchecks](https://docs.railway.com/deployments/healthchecks)).
- Checked only at deploy start; no continuous monitoring ([healthchecks](https://docs.railway.com/deployments/healthchecks)). The observability ticket needs an external uptime monitor.
- Without a healthcheck a deployment becomes Active once the container starts ([deployments reference](https://docs.railway.com/deployments/reference)).
- Zero-downtime: new and old overlap briefly (`RAILWAY_DEPLOYMENT_OVERLAP_SECONDS`); the old one gets SIGTERM, then SIGKILL after 0 s by default (`RAILWAY_DEPLOYMENT_DRAINING_SECONDS` extends it). Handle SIGTERM in Hono ([deployments reference](https://docs.railway.com/deployments/reference)).
- Crashed deployments are retried automatically up to 10 times per the restart policy ([deployment actions](https://docs.railway.com/deployments/deployment-actions)).

## Service-worker and asset caching headers

- Railway does not set app cache headers; the app must. Edge Rules cannot add or rewrite response headers (headers are match conditions only) ([edge rules](https://docs.railway.com/networking/edge-rules)).
- Railway CDN caching is **off by default**, enabled per service in Settings, Edge ([CDN](https://docs.railway.com/networking/cdn)). When enabled it honors `s-maxage`/`max-age`, skips `no-store`/`private`/`Set-Cookie`, caches static assets by Content-Type even without headers, and applies a 2 h default TTL ([CDN](https://docs.railway.com/networking/cdn)).
- Implication (recommendation, not a Railway statement): leave CDN off for the skeleton. If enabled, `sw.js` and `index.html` must send `Cache-Control: no-cache` or `no-store`, otherwise a stale script could be held at the edge. Hashed `/assets/*` can use `public, max-age=31536000, immutable`. Hono sets these in its static middleware or a header middleware.
- The CDN page does not mention `sw.js` specifically.

## Open items / unverified

- Whether the generated `*.up.railway.app` hostname survives service deletion/recreation (not documented).
- Whether a `start` script alone disables Railpack SPA mode (use `RAILPACK_NO_SPA=1`).
- pnpm via Corepack under Railpack (confirm in first build).
- Token required for `railway config apply` in CI ("Apply from GitHub Actions" page not fetched).
- Backup plan availability and Postgres crash-consistency; default Postgres major version.
- IaC DSL for restart policy, builder, and variable sealing (not on the fetched reference page).

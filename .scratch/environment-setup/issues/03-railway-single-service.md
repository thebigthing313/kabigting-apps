# Research: Railway single-service deploy
Type: research
Status: resolved
Blocked by: none

## Question

How do we deploy one Railway service serving the Hono API plus built Vite assets, with the Postgres plugin? Cover build/start config (Railpack), generated domain behavior, pre-deploy migrations, environments/staging, secrets and variables, Postgres backups and restore, healthchecks, and service-worker caching headers.

## Answer

Findings are on branch `research/railway-single-service`, file `.scratch/environment-setup/research/03-railway-single-service.md` (report is agent output, not yet reviewed by the user).

- Config as Code (`railway.json`/`toml`) is deprecated (new services stopped using it 2026-08-28; existing files stop being read 2026-12-01). Use Infrastructure as Code (`.railway/railway.ts`, GA). Generated domains are not in the IaC file, so that step is manual.
- Railpack takes the Node version from `engines.node` and runs the `build`/`start` scripts. A Vite project is auto-detected as a static SPA served by Caddy, so set `RAILPACK_NO_SPA=1` so Hono serves the app.
- Pre-deploy runs migrations in a separate container with the service's variables; a non-zero exit fails the deploy with no retry. The healthcheck runs only at deploy time, so runtime observability needs an external monitor.
- Staging is a Duplicate environment with its own Postgres; sealed secrets are not copied. Volume backups: daily/weekly/monthly (kept 6/27/89 days) plus manual; restore mounts a new volume. The docs do not mention `pg_dump` or Postgres consistency.
- Railway sets no app cache headers and Edge Rules can't add headers; Hono must send no-cache for `sw.js` and `index.html`.
- Open: does the generated domain persist, pnpm via Corepack, CI token for `railway config apply`, default Postgres version.

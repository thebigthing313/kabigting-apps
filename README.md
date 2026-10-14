# Kabigting Apps

One installable web app (PWA) that hosts a family's personal Apps behind a single sign-in.
See `CONTEXT.md` for the vocabulary.

## Stack

React + Vite + TanStack Router and TanStack DB on the client, Hono + Better Auth + Drizzle on
Postgres 18 on the server, deployed as one Railway service. Exact versions are in
`docs/versions.md`.

## Local setup

Requires Node 24, pnpm (via Corepack) and Docker.

```sh
corepack enable
pnpm install
cp .env.example .env        # then set BETTER_AUTH_SECRET
docker compose up -d        # Postgres 18
pnpm db:migrate
pnpm dev                    # Vite on :5173, API on :3000, /api proxied
```

## Scripts

| Script                  | What it does                                               |
| ----------------------- | ---------------------------------------------------------- |
| `pnpm check`            | lint, format check, typecheck, date-string check           |
| `pnpm test:all`         | unit, integration, component and e2e tests                 |
| `pnpm changeset`        | record a change for the changelog                          |
| `pnpm version-packages` | apply pending changesets to the version and `CHANGELOG.md` |

## Deploy

One Railway service runs `node src/server/index.ts`, serving `/api/*` and the built SPA, beside a
Postgres 18 service. Configuration is `.railway/railway.ts`, applied by hand:

```sh
pnpm exec railway login
pnpm exec railway link          # choose the project and the production environment
pnpm exec railway config plan   # check: no database created or deleted
pnpm exec railway config apply
```

Migrations run as the pre-deploy step. Backups and restore: `docs/restore.md`.

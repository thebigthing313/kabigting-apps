# Grill: Toolchain and repo layout
Type: grilling
Status: resolved
Blocked by: 01

## Question

Settle package manager, Node pin (.nvmrc/engines), TS config, folder layout (Shell, Apps as feature folders, server, shared code), dev workflow (Vite proxy to Hono), and build output served by Hono.

## Answer

Decided with the user (all eight recommendations accepted).

- **Package manager:** pnpm, declared via the `packageManager` field (Corepack) with a committed `pnpm-lock.yaml`. Verify Railpack honours it in the scaffold smoke test.
- **Node:** 24 LTS. `engines.node: ">=24"` and `.nvmrc` containing `24`. The user upgrades locally from 22.17.1.
- **Layout (tier first):** `src/client/` (Shell, routes, `apps/<app>`, `components/ui`), `src/server/` (Hono app, auth, db, `apps/<app>`), `src/shared/` (money, dates, zod schemas). The client never imports from `src/server`. Apps are same-named folders under each tier.
- **TypeScript:** root `tsconfig.json` references `tsconfig.client.json` (DOM, `vite/client`) and `tsconfig.server.json` (Node). `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`; `paths` aliases on the client only; no `baseUrl`; no `incremental` in CI.
- **Server runtime:** Node 24 runs the server directly from `.ts` source via type stripping. Needs `erasableSyntaxOnly`, file extensions in imports, and `package.json` subpath imports (`#server/*`) instead of path aliases. No server bundling. Fallback if it fights Drizzle or Better Auth in the smoke test: `tsx`.
- **Dev workflow:** `pnpm dev` starts two processes, Vite (5173) and Hono (3000, restarted with `node --watch`), via a small concurrent runner. Vite proxies `/api` to Hono so the browser sees one origin.
- **Local Postgres:** Docker Compose (`compose.yaml` checked in). Pin Postgres 18 in both Compose and the Railway database (Railway has an explicit PostgreSQL 18 template; its generic default could not be confirmed from first-party docs, so do not rely on it).
- **Production build and serving:** `vite build` outputs to `dist/client`. Hono serves `/api/*`, then static files, then falls back to `index.html`. `sw.js` and `index.html` get `Cache-Control: no-cache`. `start` is `node src/server/index.ts`; set `RAILPACK_NO_SPA=1`.
- **Repo hygiene:** `.editorconfig`; `.gitattributes` with `* text=auto eol=lf`; committed `.env.example` with real `.env` ignored; a `README.md` with the five commands; `AGENTS.md` pointing at `CONTEXT.md` and the decisions.
- **Smoke tests for scaffold time:** Node type stripping with Drizzle and Better Auth; Railpack with pnpm via Corepack; Postgres 18 provisioned on Railway.

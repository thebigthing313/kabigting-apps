# Agent guide

Read `CONTEXT.md` first and use its terms (Shell, App, Account, Admin, Guest, Amount). For the
Finances App, also read `docs/finances/CONTEXT.md`: there, Account means a payee or income source.
`CONTEXT-MAP.md` lists every glossary.

## Layout

- `src/client` — the React SPA (Vite, TanStack Router). May use the `@/` and `@shared/` aliases.
- `src/server` — Hono API, run directly by Node with type stripping. Use `#server/*` and
  `#shared/*` imports with `.ts` extensions; no enums, namespaces or parameter properties.
- `src/shared` — code used by both tiers; relative imports with `.ts` extensions only.
- Each App has `src/client/apps/<app>` and `src/server/apps/<app>`; Apps never import each other.

## Rules enforced by `pnpm check`

- Oxlint with zero warnings, typed rules and React Compiler rules; import boundaries live in
  `oxlint.config.ts`. TanStack DB is imported only in `src/client/data/`. `date-fns` is imported
  only in `src/shared/dates.ts`. No `new Date(<string>)` outside that file.
- Prettier formatting, `tsc --noEmit` for both tiers.

## Conventions

- Money is integer cents, signed (outflow negative), through `src/shared/money.ts`.
- Calendar dates are `YYYY-MM-DD` strings; instants are UTC. Household zone is `America/New_York`.
- Versions are exact pins; record new or changed pins in `docs/versions.md`.
- Add a changeset (`pnpm changeset`) for user-facing changes.
- Never commit secrets, real data, the Access database or exports, or personal names, emails or
  local paths. The repository is public. Never use `--no-verify`.

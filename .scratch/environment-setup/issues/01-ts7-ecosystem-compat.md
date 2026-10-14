# Research: TypeScript 7 ecosystem compatibility
Type: research
Status: resolved
Blocked by: none

## Question

Which of our must-haves work with TypeScript 7 (native/tsgo) today, and with which versions? Cover: React Compiler (babel plugin) under Vite, the Vite and @vitejs/plugin-react versions, TanStack Router's Vite plugin and type-heavy inference, Hono RPC types, Better Auth and Drizzle types, shadcn CLI, and linters/formatters (typescript-eslint, Biome, oxlint). Report breakages, workarounds, and the pinned version set that works.

## Answer

Findings are on branch `research/ts7-ecosystem-compat` (commit f1bf76a), file `.scratch/environment-setup/research/01-ts7-ecosystem-compat.md`. Agent output; "works" means owners' docs, peer ranges and issue trackers say it works. No real build was run. Not yet reviewed by the user.

- TypeScript 7.0.2 is stable (July 2026). No must-have is blocked for a plain Vite SPA with Hono, Better Auth and Drizzle. TS 7.0 has no stable programmatic API (arrives in 7.1; `@typescript/typescript6` supplies the old one meanwhile).
- Pinned set (npm "latest" on 2026-10-14): typescript 7.0.2, vite 8.3.4, @vitejs/plugin-react 6.1.2, babel-plugin-react-compiler 1.0.0, @rolldown/plugin-babel 0.2.4 (needs Node 22.12+; React Compiler via `reactCompilerPreset()`), @tanstack/react-router 1.170.44, @tanstack/router-plugin 1.168.46, @tanstack/react-db 0.5.9, hono 4.13.13, better-auth 1.7.7, drizzle-orm 0.45.4 (1.0 RC also accepted by Better Auth), shadcn 4.21.5.
- Breakages: shadcn's Vite docs say to set `baseUrl`, which is a hard error in TS 7, so use `paths` only. `types` now defaults to `[]`, so list `vite/client`. TS 7.0.2 has a false TS2589 after incremental rebuilds, so avoid `incremental` for CI type checks.
- Linting: typescript-eslint is capped below TS 6.1 and would need a TS6 alias. Oxlint 1.88.0 + oxlint-tsgolint 7.0.2004 target TS 7.0.2 (59 of 61 typed rules). Biome 2.5.15 does not use tsc; no primary Biome statement on TS 7 was found.
- Open for scaffold time: run a real `tsc --noEmit` on the pinned set; check `shadcn init` works without `baseUrl`; check whether the Router `Register` augmentation needs `@tanstack/router-core` in plain SPA mode. Lint tool choice is left to the lint/format ticket.

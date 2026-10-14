# Research: Lint and format tooling facts
Type: research
Status: resolved
Blocked by: none

## Question

Facts the lint and format tool choice (ticket "Grill: Lint and format") waits on, as of 2026-10-14:
1. Oxfmt: stability/maturity; coverage of TS/TSX, CSS, JSON, Markdown; Tailwind class sorting; Prettier-compat options.
2. React Compiler lint rules (the `eslint-plugin-react-hooks` compiler rules): available in Oxlint? In Biome? Or only via ESLint?
3. Import boundary rules: can Oxlint (and Biome) restrict imports per directory glob (client must not import `src/server`, with one type-only exception file; `shared` must not import `hono`/`pg`/`drizzle-orm`; one App must not import another App)? Which rule/config, and is `import type` distinguishable?
4. Ban-specific-syntax rules (e.g. `new Date(<string>)`): supported?
5. Biome 2.5.x and TypeScript 7 compatibility, from a primary source if any.
6. Whether ESLint with a TS6 alias for typescript-eslint is still the only route to full typed linting.

## Answer

Findings are on branch `research/lint-format-tooling` (commit 5f0b94b), file `.scratch/environment-setup/research/18-lint-format-tooling.md`. Each claim there is tagged primary (P), inference (I) or unconfirmed (U). Agent output; not yet reviewed by the user.

- **Oxfmt** is 0.73.0, pre-1.0, with [BREAKING] items in its latest notes and no stable claim in the docs. It natively formats TS/TSX, CSS, JSON and Markdown, and has built-in Tailwind class sorting (`sortTailwindcss`, off by default, `stylesheet` option for v4). Prettier-style options, default `printWidth` 100, no Prettier plugin support. How its CSS formatter treats Tailwind v4 at-rules is unconfirmed.
- **React Compiler lint rules:** native in Oxlint (22 rules, announced 2026-08-18; enable the `react` plugin plus the `correctness` category). Biome has only one nursery rule, `useReactCompiler`. `eslint-plugin-react-hooks` is the reference implementation.
- **Import boundaries:** Oxlint's `no-restricted-imports` covers them. Scope with `overrides[].files`, and `allowTypeImports: true` allows `import type` for the one client file. Overrides don't merge options, so use `oxlint.config.ts` and spread a shared base. Patterns match the import specifier string, so path aliases are safer than relative paths (inference). Biome's `noRestrictedImports` has no type-only option, so it cannot make the exception.
- **Banning syntax:** Biome can via GritQL plugins. Oxlint has no native `no-restricted-syntax`; it is available through the alpha `oxlint-plugin-eslint` package. Neither can tell whether a `new Date(x)` argument is a string without type info.
- **Biome and TS 7:** no primary source found (Biome 2.5.15). It has its own parser and type inference, so it is probably unaffected (inference). Its Markdown formatting is still in progress.
- **typescript-eslint cannot run on TS 7** until TS 7.1 ships an API (PR #12803 is open). ESLint with a TS 6 alias is therefore not the only route: Oxlint type-aware linting via `oxlint-tsgolint` (requires TS 7.0+, 59 of 61 typed rules) is the other, though still experimental in places and without custom type-aware rules.

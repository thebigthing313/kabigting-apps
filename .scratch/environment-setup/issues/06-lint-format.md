# Grill: Lint and format
Type: grilling
Status: resolved
Blocked by: 01

## Question

Pick lint/format tooling compatible with TypeScript 7 and the React Compiler (Biome, oxlint+oxfmt, or ESLint+Prettier), the rules, and whether it runs in pre-commit and CI.

## Interim decisions (user-confirmed; ticket stays claimed until the tool choice is made)

Waiting on "Research: Lint and format tooling facts" for the tool choice.

- **Hooks:** Husky + lint-staged. Pre-commit formats and lints staged files, auto-fixes and re-stages. Never `--no-verify`. Typecheck, tests and build run in pre-push/CI. One `pnpm check` script (lint, format check, typecheck) is what CI calls.
- **Strictness:** correctness, suspicious-code and React rules are errors; no style-opinion rules (the formatter owns style); zero warnings (CI fails on any warning). `any`, floating promises, and unused variables/imports are errors. Console logging allowed in `src/server` and `scripts/`, an error in `src/client`.
- **Format style:** 2-space indent, double quotes, no semicolons, trailing commas, line width 100, LF endings. Flip semicolons if shadcn's generated output turns out to use them (confirm at scaffold).
- **Generated and vendored files:** excluded from lint and format: `routeTree.gen.ts`, the generated `auth.ts` schema, migration SQL, `dist/`. shadcn files in `src/client/components/ui/` are formatted and linted with a short relaxed-rule list.
- **Architecture rules enforced as lint errors:**
  1. `src/client` must not import `src/server`, except the type-only import in `src/client/data/api.ts`.
  2. `src/server` must not import `src/client`.
  3. `src/shared` must not import `src/client`, `src/server`, `hono`, `pg`, `drizzle-orm` or `better-auth`.
  4. TanStack DB packages may only be imported inside `src/client/data/`.
  5. One App must not import another App's folder, in either tier.
  6. `date-fns` and `@date-fns/tz` may only be imported from the `dates` module.
  7. No `new Date(<string>)`.
  - Floating-point money math is left to the `money` helper's API and code review (not lintable). If the chosen tool cannot express a rule, flag it and decide: drop it or add a small custom check script.

## Answer

Decided with the user. The interim decisions above (hooks, strictness, format style, generated files, architecture rules) stand, plus:

- **Lint tool:** Oxlint, with `oxlint-tsgolint` for the typed rules (needs TS 7.0+; covers 59 of 61 typescript-eslint typed rules). Enable the `react` plugin and the `correctness` category to get the native React Compiler rules. Configure with `oxlint.config.ts` and spread a shared base into each `overrides[]` entry, since overrides don't merge options.
- **Import boundaries:** rules 1–6 use `no-restricted-imports` scoped by `overrides[].files`, with `allowTypeImports: true` for the single file `src/client/data/api.ts`. Match path aliases rather than relative paths where possible.
- **Rule 7 (no `new Date(<string>)`):** changed from a lint rule to a grep check inside `pnpm check`, because Oxlint has no native `no-restricted-syntax` and no syntax-only rule can know an argument is a string. The `dates` module being the only date code (rule 6) is the real protection.
- **Formatter:** Prettier, pinned, with `prettier-plugin-tailwindcss` for class sorting. Oxfmt is pre-1.0 with breaking changes; revisit at 1.0. The linter carries no style rules, so Oxlint and Prettier don't overlap. Confirm `prettier-plugin-tailwindcss` with Tailwind v4 in research 19.
- **Not used:** Biome (cannot make the type-only import exception) and ESLint with typescript-eslint (cannot run on TS 7 until 7.1).
- **Scaffold-time smoke tests:** `oxlint-tsgolint` against the pinned TS 7.0.2; the React Compiler rules fire on a deliberate violation; each boundary rule fails on a deliberate violation, with the `api.ts` type-only exception passing.

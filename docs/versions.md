# Versions and verification

Exact pins and the results of the scaffold-time checks (spec section 13). Dates are when the
pin was resolved or the check was run.

## Pins resolved at scaffold

| Package                 | Version                                            | Resolved   |
| ----------------------- | -------------------------------------------------- | ---------- |
| prettier                | 3.9.10                                             | 2026-10-14 |
| husky                   | 9.1.7                                              | 2026-10-14 |
| lint-staged             | 17.6.0                                             | 2026-10-14 |
| @types/node             | 24.19.2 (matches the Node 24 runtime)              | 2026-10-14 |
| @changesets/cli         | 3.0.3 (added at the user's request during phase 1) | 2026-10-14 |
| postgres (Docker image) | 18.6                                               | 2026-10-14 |

## Verification results

| Check                                                                                 | Result                                                                                                           | Date       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `oxlint-tsgolint` 7.0.2004 runs against TypeScript 7.0.2 (`options.typeAware`)        | Pass: `typescript/no-floating-promises` reports a deliberate floating promise                                    | 2026-10-14 |
| React Compiler lint rules fire                                                        | Pass: `react/purity` reports `Math.random()` during render                                                       | 2026-10-14 |
| Boundary 1: client must not import server; `api.ts` type-only exception               | Pass: value import fails in `src/client` and `src/client/data`; `import type` in `src/client/data/api.ts` passes | 2026-10-14 |
| Boundary 2: server must not import client                                             | Pass: relative and `@/` imports fail                                                                             | 2026-10-14 |
| Boundary 3: shared must not import client, server, hono, pg, drizzle-orm, better-auth | Pass: each fails                                                                                                 | 2026-10-14 |
| Boundary 4: TanStack DB only in `src/client/data/`                                    | Pass: fails in `src/client`, passes in `src/client/data`                                                         | 2026-10-14 |
| Boundary 5: no cross-App imports                                                      | Pass with a temporary second App key: relative and `@/apps/<b>` imports fail                                     | 2026-10-14 |
| Boundary 6: date-fns only in `src/shared/dates.ts`                                    | Pass: fails in `src/server`, passes in `dates.ts`                                                                | 2026-10-14 |
| Rule 7: `new Date(<string>)` grep check                                               | Pass: flags `new Date("2026-01-01")`, allows `new Date(0)` and `new Date()`                                      | 2026-10-14 |
| `tsc --noEmit` on the phase 1 configs with TypeScript 7.0.2                           | Pass (no `baseUrl`, no `incremental`)                                                                            | 2026-10-14 |

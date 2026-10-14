# Research: Lint and format tooling facts
Type: research
Status: open
Blocked by: none

## Question

Facts the lint and format tool choice (ticket "Grill: Lint and format") waits on, as of 2026-10-14:
1. Oxfmt: stability/maturity; coverage of TS/TSX, CSS, JSON, Markdown; Tailwind class sorting; Prettier-compat options.
2. React Compiler lint rules (the `eslint-plugin-react-hooks` compiler rules): available in Oxlint? In Biome? Or only via ESLint?
3. Import boundary rules: can Oxlint (and Biome) restrict imports per directory glob (client must not import `src/server`, with one type-only exception file; `shared` must not import `hono`/`pg`/`drizzle-orm`; one App must not import another App)? Which rule/config, and is `import type` distinguishable?
4. Ban-specific-syntax rules (e.g. `new Date(<string>)`): supported?
5. Biome 2.5.x and TypeScript 7 compatibility, from a primary source if any.
6. Whether ESLint with a TS6 alias for typescript-eslint is still the only route to full typed linting.

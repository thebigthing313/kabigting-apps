# Research: TypeScript 7 ecosystem compatibility

Ticket: [01-ts7-ecosystem-compat](../issues/01-ts7-ecosystem-compat.md)
Researched: 2026-10-14. Versions are npm `latest` dist-tags read from the registry that day (`npm view`). Issue states are from `gh` on that day.

## Verdict

TypeScript 7 is stable (7.0.2) and every must-have is usable with it for a plain Vite SPA + Hono + Better Auth + Drizzle stack. There are no blockers. The real constraints are:

1. **No stable programmatic API until TS 7.1.** Tools that import `typescript` (typescript-eslint, Vue/Astro/Svelte tooling) need the TS 6 compat package alongside.
2. **typescript-eslint is capped at TS < 6.1** by its peer range. Use oxlint + tsgolint for type-aware linting instead, or alias TS 6 for typescript-eslint.
3. **Stricter `tsconfig` defaults and hard errors** (`baseUrl`, `types: []`, `moduleResolution: node`) affect the shadcn Vite docs and any Vite template tsconfig.
4. **A few type-heavy libraries have open edge-case issues** (Better Auth declaration emit, Drizzle 0.45 wide tables, Hono recursive JSON under incremental builds). None should hit a walking skeleton.

I did not scaffold or build anything, so "works" below means "supported by the owner's docs / peer ranges / issue tracker", not "I ran it together". The pinned set should get one real `tsc --noEmit` pass at scaffold time.

## TypeScript 7 itself

- TS 7.0 announced 2026-07-08, a native Go port. npm `typescript` `latest` is **7.0.2**; `rc` 7.0.1-rc; `next` is 7.1.0-dev nightlies (daily). `@typescript/native-preview` is frozen at 7.0.0-dev.20260707.2 (npm registry), so use `typescript` itself. Source: [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- Install: `npm install -D typescript`; `npx tsc` is the native compiler. Nightlies: `typescript@next`. (same post)
- **No stable programmatic API in 7.0**; "a new (and different) API" is expected in 7.1. For tools needing the old API, `@typescript/typescript6` (npm latest 6.0.2, executable `tsc6`) re-exports the 6.0 API. The post recommends npm aliases: `"typescript": "npm:@typescript/typescript6@^6.0.2"` plus `"@typescript/native": "npm:typescript@^7.0.2"`; with both, `npx tsc` runs 7.0. (same post)
- Not supported yet: Vue, MDX, Astro, Svelte, Angular template checking. Irrelevant to this stack (React). (same post)
- Breaking changes that matter here (same post; full list in [typescript-go CHANGES.md](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md)):
  - Defaults: `strict: true`, `module: esnext`, `noUncheckedSideEffectImports: true`, `types: []`, `rootDir: ./`.
  - `types` defaults to `[]`, so `"types": ["vite/client", "node"]` etc. must be explicit.
  - Hard errors: `baseUrl`, `moduleResolution: node|node10|classic`, `target: es5`, `esModuleInterop: false`, `allowSyntheticDefaultImports: false`, import `asserts`.
  - `tsc` with file args and a `tsconfig.json` present errors unless `--ignoreConfig`.
  - Code clean on TS 6.0 (with `stableTypeOrdering`, no `ignoreDeprecations`) should be clean on 7.0.
- Known compiler-level differences still open or fixed: [typescript-go#3688](https://github.com/microsoft/typescript-go/issues/3688) (`const T extends string = string` binds to the default instead of inferring; closed, listed by TanStack as the known difference); [TypeScript#64405](https://github.com/microsoft/TypeScript/issues/64405) incremental-build false TS2589, fixed by TypeScript#64452 merged 2026-09-25, present in 7.0.2 and fixed in `7.1.0-dev.20260926.1` per [honojs/hono#5441](https://github.com/honojs/hono/issues/5441).

## Per-component findings

### Vite, @vitejs/plugin-react, React Compiler

- Current: `vite` **8.3.4**, `@vitejs/plugin-react` **6.1.2**, `babel-plugin-react-compiler` **1.0.0**, `@rolldown/plugin-babel` **0.2.4**, `react` 19.3.1. Node: Vite 8 and plugin-react 6 need `^20.19 || >=22.12`; `@rolldown/plugin-babel` 0.2.4 needs `>=22.12 || ^24` (npm `engines`). Pin Node 22.12+ (or 24).
- plugin-react 6.x peer-requires `vite ^8` and optionally `@rolldown/plugin-babel ^0.1.7 || ^0.2.0` and `babel-plugin-react-compiler ^1.0.0` (npm peerDependencies).
- React Compiler setup (official, [react.dev installation](https://react.dev/learn/react-compiler/installation)): `@vitejs/plugin-react` >= 6.0.0 removed the inline `babel` option. Use `@rolldown/plugin-babel` with `presets: [reactCompilerPreset()]` imported from `@vitejs/plugin-react`, after `react()` in `plugins`. The compiler must run first among Babel plugins.
- TS 7 interaction: the compiler and Vite pipeline operate on source text, not the TypeScript compiler API. The react.dev page has no TypeScript requirement. I found no TS 7 issue for Vite, plugin-react or the compiler (GitHub issue search "typescript 7" in vitejs/vite and vitejs/vite-plugin-react returned nothing relevant). Inference: type checking is a separate `tsc --noEmit` step, so TS 7 does not touch the build.
- Needs `@types/node` (26.6.5 latest) only for `vite.config.ts` path alias.

### TanStack Router (+ Vite plugin)

- Current: `@tanstack/react-router` **1.170.44**, `@tanstack/router-plugin` **1.168.46** (peer `vite >=5 ... >=8`, `@tanstack/react-router ^1.170.44`, node `>=20.19`). Vite 8 is in the peer range.
- Official tracking issue [TanStack/router#7328](https://github.com/TanStack/router/issues/7328) "Tracking: TypeScript 7 (tsgo) compat" was closed as completed 2026-07-23; the repo keeps a `tsgo-typecheck` branch for testing. Its only listed behaviour difference is typescript-go#3688 above.
- Fixed regression: [#7709](https://github.com/TanStack/router/issues/7709) (tsgo dropped a route search intersection member, `stripSearchParams` rejected with TS2322 on native-preview >= 20260624.1) closed; root cause was [typescript-go#4462](https://github.com/microsoft/typescript-go/issues/4462), reported solved.
- Open, **TanStack Start only**: [#8186](https://github.com/TanStack/router/issues/8186) with [PR #8194](https://github.com/TanStack/router/pull/8194) open. TS 7's "owning-package" rule needs `Register` augmented on `@tanstack/router-core`; Start's generated server entry imports it from `@tanstack/react-router`. Workaround: augment both. Not relevant to a plain SPA router (the issue is specific to Start's server entry; the issue does not state SPA impact, so this is inference). Per the Router docs ([type safety guide](https://tanstack.com/router/latest/docs/framework/react/guide/type-safety)) the documented augmentation is `declare module '@tanstack/react-router'`; under TS 7 consider augmenting `@tanstack/router-core` as well (cheap, backward compatible per PR #8194) and check it in the skeleton.
- Older anecdote: [#5724](https://github.com/TanStack/router/issues/5724) (tsgo + tRPC + Workers, beforeLoad context typed wrong); user fixed by renaming a context type. Pre-TS7, closed; mention only as a symptom to recognise.
- Type-heavy inference verdict: supported by the maintainers' own tsgo CI branch; no unresolved SPA-relevant inference regression found.

### TanStack DB

- `@tanstack/react-db` **0.5.9** (depends on `@tanstack/db` 0.14.0, peer `react >=18`). Pre-1.0, so pin exactly. No TS 7 issue found (search of TanStack/db for "typescript 7" returned none relevant). Scope of this ticket is TS 7 only; API stability belongs to another ticket.

### Hono RPC

- `hono` **4.13.13** (a `next` tag is 5.0.0-rc.1; stay on 4.x).
- TS 7 issues found, all closed: [#5441](https://github.com/honojs/hono/issues/5441) recursive JSON response gives TS2589 after an *incremental* rebuild with TS 7. It reproduces without Hono; fixed in TypeScript by #64452 (see TS section); present in 7.0.2, fixed in 7.1 nightlies. Workaround on 7.0.2: avoid `incremental` for `tsc --noEmit` in CI, or avoid recursive response types. [#5480](https://github.com/honojs/hono/issues/5480) `hono/jsx` `IntrinsicElements` self-reference on TS 7.0.2 with hono 4.13.10; maintainer says fixed in a newer version (4.13.13 is later). We do not use hono/jsx.
- Hono's own docs say RPC typing needs chained route definitions off one app instance and `strict` (secondary summaries only; confirm in [Hono RPC docs](https://hono.dev/docs/guides/rpc) at scaffold time). TS 7 defaults `strict` on anyway.

### Better Auth

- `better-auth` **1.7.7** (also `release-1.6` 1.6.33 tag). Peer `drizzle-orm ^0.45.2 || >=1.0.0-rc.1 <2.0.0`, `drizzle-kit >=0.31.4 || >=1.0.0-beta.1`; React 18/19.
- Open under TS 7/tsgo: [better-auth#10560](https://github.com/better-auth/better-auth/issues/10560) declaration emit for `oauthProviderClient()` references an internal hashed chunk (TS2883) when building with `declaration: true`. Maintainers acknowledge and plan a fix. Does not affect us: we use `noEmit` and no OAuth-provider plugin. Related closed: [#8781](https://github.com/better-auth/better-auth/issues/8781) crash with 25+ client plugins (not our scale).
- Type-inference note: [typescript-go#2162](https://github.com/microsoft/typescript-go/issues/2162) (callback parameter inferred `any` in Better Auth plugin callback, early tsgo LSP); status not verified here, check in editor during scaffold.

### Drizzle

- `drizzle-orm` `latest` **0.45.4** (`beta` 1.0.0-beta.22, `rc` 1.0.0-rc.4); `drizzle-kit` `latest` 0.31.11. Better Auth 1.7.7 accepts either line.
- [drizzle-orm#6391](https://github.com/drizzle-team/drizzle-orm/issues/6391) (open): on 0.45.x `$inferInsert` cost grows quadratically with column count; TS2589 at 424 columns, reproduced on TS 5.6.3 and 7.0.2; not present in 1.0 beta/rc. Irrelevant for normal table widths. [#5187](https://github.com/drizzle-team/drizzle-orm/issues/5187) (open): errors in `.d.ts` when `skipLibCheck: false` (reported on TS 5.9.3); keep `skipLibCheck: true`.
- No Drizzle issue specific to TS 7 correctness found. Choosing 0.45.4 vs 1.0 RC belongs to the ORM ticket.

### shadcn CLI

- `shadcn` **4.21.5** (node `>=20.18.1`). Its [Vite install page](https://ui.shadcn.com/docs/installation/vite) tells you to set `"baseUrl": "."` plus `paths` `@/*` in `tsconfig.json` and `tsconfig.app.json`. **`baseUrl` is a hard error in TS 7.** Tracked for TS 6 as [shadcn-ui/ui#11421](https://github.com/shadcn-ui/ui/issues/11421) (open, 2026-08).
- Workaround: omit `baseUrl` and use `"paths": { "@/*": ["./src/*"] }` (paths resolve relative to the tsconfig since TS 4.1; the TS 7 hard-error list in the announcement removes `baseUrl` only), and keep the Vite `resolve.alias`. Verify `shadcn init` still resolves the alias without `baseUrl` (shadcn reads tsconfig `paths`); if init rewrites `baseUrl`, delete it afterwards.

### Linters / formatters

- **typescript-eslint** `latest` 8.71.2: peer `typescript >=4.8.4 <6.1.0`, eslint 8/9/10. Docs ([dependency versions](https://typescript-eslint.io/users/dependency-versions/)) do not mention TS 7. Using it requires the `typescript` -> `@typescript/typescript6` alias above, plus a native alias for `tsc` (two TS copies).
- **oxlint** `latest` **1.88.0** with **oxlint-tsgolint 7.0.x** (npm `latest` 7.0.2004; oxlint peer `oxlint-tsgolint >=7.0.2003`). [Oxc type-aware linting stable](https://oxc.rs/blog/2026-07-22-type-aware-linting-stable) (2026-07-22): tsgolint v7 tracks TypeScript 7.0.2, covers 59 of typescript-eslint's 61 type-aware rules; install `oxlint oxlint-tsgolint@7`; `--type-aware` enables rules and `--type-check` reports compiler errors from the same program (options `typeAware`/`typeCheck` in config). Speed claims are vendor benchmarks. Oxc docs earlier described type-aware linting as preview, so treat as young.
- **Biome** `latest` **2.5.15**. Biome 2 does type-aware rules with its own inference engine and does not call `tsc` ([Biome type inference post](https://biomejs.dev/blog/vercel-partners-biome-type-inference); maintainers say they will not rebuild the checker). So TS 7 should not affect it; I found no primary Biome statement about TS 7, so this is inference. Its inference is partial compared with typescript-eslint.
- Real type checking stays `tsc --noEmit` (TS 7) regardless of linter.

## Pinned version set (candidate)

| Package | Version |
|---|---|
| node | 22.12+ (or 24); required by `@rolldown/plugin-babel` 0.2.4 |
| typescript | 7.0.2 (exact) |
| vite | 8.3.4 |
| @vitejs/plugin-react | 6.1.2 |
| @rolldown/plugin-babel | 0.2.4 |
| babel-plugin-react-compiler | 1.0.0 |
| @babel/core | ^7.29 (peer of the rolldown babel plugin) |
| react / react-dom | 19.3.1 |
| @tanstack/react-router | 1.170.44 |
| @tanstack/router-plugin | 1.168.46 |
| @tanstack/react-db | 0.5.9 (pre-1.0, pin exact) |
| hono | 4.13.13 |
| better-auth | 1.7.7 |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 (or 1.0 RC; decided in ORM ticket) |
| shadcn (CLI) | 4.21.5 |
| oxlint + oxlint-tsgolint | 1.88.0 + 7.0.2004 (`oxlint-tsgolint@7`) |
| @biomejs/biome (formatter) | 2.5.15 |
| @types/node | 26.6.5, or match the Node major |

If typescript-eslint is chosen instead of oxlint: add `"typescript": "npm:@typescript/typescript6@^6.0.2"`, `"@typescript/native": "npm:typescript@7.0.2"`, `typescript-eslint` 8.71.2.

## tsconfig implications for the skeleton

- No `baseUrl`; `paths` only. Explicit `"types": ["vite/client"]` (plus `node` for server code). `moduleResolution: bundler`, `module: esnext`, `strict`. Keep `skipLibCheck: true`.
- Avoid `incremental` for CI typechecking on 7.0.2 (TypeScript#64405 false TS2589 after edits), or move to `typescript@7.1` nightly once it releases.

## Open items to verify during scaffold (not resolved by docs)

1. Run `tsc --noEmit` on a real skeleton with this exact set (Router route tree + Hono `hc` + Better Auth client + Drizzle schema); that is the only true proof.
2. Does `shadcn init`/`add` work without `baseUrl`?
3. Does Router `Register` augmentation need `@tanstack/router-core` under TS 7 in plain SPA mode (issue #8186 is Start-specific)?
4. State of typescript-go#2162 (Better Auth callback inference) in 7.0.2.
5. No primary Biome statement on TS 7; recommended lint choice (oxlint+tsgolint vs typescript-eslint+alias vs Biome) is a decision for the lint/format ticket.

## Sources

- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://github.com/microsoft/typescript-go/blob/main/CHANGES.md
- https://github.com/microsoft/typescript-go/issues/3688, /2162, /4462
- https://react.dev/learn/react-compiler/installation
- https://typescript-eslint.io/users/dependency-versions/
- https://oxc.rs/blog/2026-07-22-type-aware-linting-stable
- https://biomejs.dev/blog/vercel-partners-biome-type-inference
- https://github.com/TanStack/router/issues/7328, /7709, /8186, /5724; PR /8194
- https://tanstack.com/router/latest/docs/framework/react/guide/type-safety
- https://github.com/honojs/hono/issues/5441, /5480
- https://github.com/better-auth/better-auth/issues/10560, /8781
- https://github.com/drizzle-team/drizzle-orm/issues/6391, /5187
- https://ui.shadcn.com/docs/installation/vite, https://github.com/shadcn-ui/ui/issues/11421
- npm registry (`npm view <pkg> dist-tags / peerDependencies / engines`), 2026-10-14

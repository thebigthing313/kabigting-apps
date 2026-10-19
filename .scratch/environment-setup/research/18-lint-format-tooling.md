# 18 - Lint / format tooling: Oxlint, Oxfmt, Biome, ESLint under TypeScript 7

Researched 2026-10-14. Project: Vite + React 19 + TS 7.0.2, React Compiler, Tailwind, Hono, Drizzle, single package (`src/client`, `src/server`, `src/shared`).

Legend: **[P]** = read from a primary source (official docs, source code in the owning repo, release page, maintainer comment). **[I]** = my inference or a judgement; verify before relying on it. **[U]** = looked for it, could not confirm.

Versions seen today (primary: GitHub releases / `npm view`): oxlint 1.88.0, oxfmt 0.73.0 (both 2026-10-13), oxlint-tsgolint 7.0.2004 (2026-10-10), Biome CLI 2.5.15 (2026-09-30), typescript-eslint 8.71.2 (2026-10-12), TypeScript 7.0.2 (2026-07-08), eslint-plugin-react-hooks 7.1.1.
Sources: <https://github.com/oxc-project/oxc/releases>, <https://github.com/biomejs/biome/releases>, <https://github.com/typescript-eslint/typescript-eslint/releases>, <https://github.com/microsoft/typescript-go/releases>.

---

## Short answers

1. **Oxfmt**: usable and heavily documented, but still pre-1.0 (0.73.0, with `[BREAKING]` entries in the latest release notes). TS/TSX, CSS, JSON and Markdown are all native Rust. Tailwind class sorting is built in (`sortTailwindcss`, off by default). It aims for Prettier output and treats differences as bugs.
2. **React Compiler lint rules**: **Oxlint has them natively** (22 rules, announced 2026-08-18). **Biome has one nursery rule, `useReactCompiler`** (since 2.5.8, not recommended), which runs React's own Rust compiler in lint mode. ESLint (`eslint-plugin-react-hooks`) remains the reference implementation, and Oxlint can also load it as a JS plugin (alpha).
3. **Import boundaries**: Oxlint `no-restricted-imports` with `overrides[].files` per directory glob, and `allowTypeImports: true` distinguishes `import type`. Biome `noRestrictedImports` has **no** type-only option, so it cannot make the "one file may import types only" exception. Neither tool has a dedicated directory-boundaries rule comparable to `eslint-plugin-boundaries`.
4. **Syntax bans**: Biome via GritQL plugins (stable enough to ship in docs). Oxlint has **no native `no-restricted-syntax`**, but `oxlint-plugin-eslint` (ESLint core rules as an Oxlint JS plugin, alpha) provides it with AST selectors, via an alias.
5. **Biome 2.5.x + TS 7**: no primary source states compatibility. Biome has its own parser and type inference and does not call the TypeScript compiler, so it is probably unaffected. This is inference.
6. **No.** typescript-eslint still cannot run on TS 7 (no JS API until TS 7.1). The TS 6 alias is the only *ESLint* route today, but **Oxlint type-aware linting (`oxlint-tsgolint`) requires TS 7.0+ and covers 59 of 61 typescript-eslint type-aware rules**, so it is a second route.

---

## 1. Oxfmt

### Maturity [P]
- Version 0.73.0, released weekly alongside Oxlint. The latest release lists breaking changes: "`oxfmt: [BREAKING] Improve --migrate prettier`" and "`formatter_toml: [BREAKING] Add oxc_formatter_toml crate`". <https://github.com/oxc-project/oxc/releases/tag/oxfmt_v0.73.0>
- The docs make no explicit "stable" or "beta" claim. They call it "the recommended choice when you want a dedicated formatter with a Prettier-compatible workflow." <https://oxc.rs/docs/guide/usage/formatter.html> (source: <https://github.com/oxc-project/website/blob/main/src/docs/guide/usage/formatter.md>)
- A config option is still named `experimentalOperatorPosition`. `experimentalTernaries` is unsupported. <https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html>, <https://github.com/oxc-project/website/blob/main/src/docs/guide/usage/formatter/unsupported-features.md>
- Claims: ~30x faster than Prettier, ~2x faster than Biome (their own benchmark repo, vendor claim). "Oxfmt is tested against Prettier's own test suite for each natively supported language." Known divergences are listed in <https://github.com/oxc-project/oxc/blob/main/apps/oxfmt/DIVERGENCES.md>. Everything I read there is an edge case (Vue generics, styled-components v3, gql templates, markdown fences with line-range meta, lwc, sass in astro). None touches ordinary TS/TSX/CSS/JSON/MD.
- [I] 0.x versioning plus per-release breaking changes means pin the exact version and expect occasional reformat diffs on upgrade.

### Language coverage [P]
Native Rust formatters (no Node round-trip), from <https://github.com/oxc-project/website/blob/main/src/docs/guide/usage/formatter/language-support.md>:
- TypeScript / TSX: `.ts .tsx .mts .cts .d.ts`
- CSS: `.css .scss .less .pcss .postcss`
- JSON: `.json .jsonc .json5`
- Markdown: `.md .markdown`
- Also native: JS/JSX, GraphQL, TOML, YAML.
- Prettier-backed (bundled, npm package only): HTML, Vue, Svelte, Astro, MDX, Handlebars, MJML.
- Embedded: CSS-in-JS and GraphQL in template literals and Markdown code blocks are formatted. <https://oxc.rs/docs/guide/usage/formatter/embedded-formatting>
- [U] Whether the native CSS formatter handles Tailwind v4 at-rules (`@theme`, `@utility`, `@apply`, `@source`) without mangling. Not stated in the pages I read. Test on the real stylesheet.

### Tailwind class sorting [P]
- Config key `sortTailwindcss`, **disabled by default**. "Based on prettier-plugin-tailwindcss". <https://github.com/oxc-project/website/blob/main/src/docs/guide/usage/formatter/sorting.md>
- Sub-options: `stylesheet` (Tailwind v4 stylesheet path, defaults to installed `theme.css`), `config` (Tailwind v3 config), `attributes`, `functions` (e.g. `["clsx", "cn"]`), `preserveDuplicates`, `preserveWhitespace`. `attributes` and `functions` are exact match only, no regex. <https://oxc.rs/docs/guide/usage/formatter/config-file-reference.html>
- Prettier plugins in general are not supported; built-in replacements exist for sort-imports, Tailwind, package.json and JSDoc. <https://github.com/oxc-project/website/blob/main/src/docs/guide/usage/formatter/unsupported-features.md>
- [I] Because it is a re-implementation, order parity with `prettier-plugin-tailwindcss` is the goal but not verified by me. Point `stylesheet` at the project's Tailwind v4 entry CSS so custom theme utilities sort correctly.

### Prettier-compat options [P]
Config reference lists (defaults in brackets): `arrowParens ["always"]`, `bracketSameLine`, `bracketSpacing`, `embeddedLanguageFormatting`, `endOfLine ["lf"]`, `htmlWhitespaceSensitivity`, `insertFinalNewline`, `jsxSingleQuote`, `objectWrap`, `printWidth` **[100, Prettier is 80]**, `proseWrap`, `quoteProps`, `semi`, `singleAttributePerLine`, `singleQuote`, `tabWidth`, `trailingComma ["all"]`, `useTabs`, `overrides`, `ignorePatterns`, plus Oxfmt-only `sortImports`, `sortPackageJson` (on by default), `sortTailwindcss`, `jsdoc`, `experimentalOperatorPosition`.
Not supported: `prettier` field in `package.json`, nested `.editorconfig`, `experimentalTernaries`. `oxfmt --migrate prettier` exists. Config files: `.oxfmtrc.json` or `oxfmt.config.ts`. Sources as above.
Built-in import sorting is modelled on `eslint-plugin-perfectionist/sort-imports`, with no `tsconfigPath` resolution, so list alias prefixes in `internalPattern` or `customGroups`. [P]

---

## 2. React Compiler lint rules

### Oxlint: yes, native [P]
- Blog post "Announcing React Compiler Support", 2026-08-18: "Oxlint includes 22 React Compiler-powered rules that check for violations of the Rules of React." <https://oxc.rs/blog/2026-08-18-react-compiler-support>
- Enable with `"plugins": ["react"]` and `"categories": {"correctness": "error"}`. The correctness category turns on: error-boundaries, globals, immutability, incompatible-library, preserve-manual-memoization, purity, refs, set-state-in-effect, set-state-in-render, static-components, use-memo, void-use-memo. Off by default: unsupported-syntax, invariant, rule-suppression, syntax, todo (restriction); no-deriving-state-in-effects (perf); capitalized-calls, exhaustive-effect-dependencies, hooks, memo-dependencies (suspicious). Not implemented: `config`, `gating`, `fbt`, `memoized-effect-dependencies`. Remove the old nursery `react/react-compiler` rule if used. Same page.
- Source confirms each rule is a port of the matching `react-hooks/<rule>` lint: `declare_react_compiler_lint!` in <https://github.com/oxc-project/oxc/blob/main/crates/oxc_linter/src/rules.rs>, linking to <https://react.dev/reference/eslint-plugin-react-hooks/lints/>.
- `rules-of-hooks` and `exhaustive-deps` are native too (`react::rules_of_hooks`, `react::exhaustive_deps`, same file).
- Separate from linting: the same post describes an experimental `oxc-transform-react` plus `@vitejs/plugin-react@^6.1.0` `react({ compiler: true })` for the build transform on Vite 8, status "experimental". Not needed for lint.
- Fallback: Oxlint can load the real `eslint-plugin-react-hooks` as a JS plugin (alpha; listed with conformance tests, 99.7% of 5021 tests passing against react-hooks 19.2.3 in the conformance snapshot). <https://oxc.rs/docs/guide/usage/linter/js-plugins.html>, <https://github.com/oxc-project/oxc/blob/main/apps/oxlint/conformance/snapshots/react-hooks.md>

### Biome: one nursery rule [P]
- `useReactCompiler`, nursery, `recommended: false`, `version: "2.5.8"`, domain `react`. "This rule runs React Compiler in lint mode and reports the actionable diagnostics it emits." Option `compilationMode`: `infer` (default), `annotation`, `all`. <https://github.com/biomejs/biome/blob/main/crates/biome_js_analyze/src/lint/nursery/use_react_compiler.rs>
- Implementation depends on the `react_compiler*` crates from `github.com/react/react` pinned by git rev, i.e. React's own Rust compiler. <https://github.com/biomejs/biome/blob/main/crates/biome_react_compiler/Cargo.toml>
- It is one aggregate rule, so you do not get per-rule severity like `react-hooks/purity`. [I]
- Biome also has `useExhaustiveDependencies`, `useHookAtTopLevel`, `noNestedComponentDefinitions`, `noComponentHookFactories` (correctness). Rule listing: <https://github.com/biomejs/biome/tree/main/crates/biome_js_analyze/src/lint/correctness>

### ESLint [P]
`eslint-plugin-react-hooks` `recommended` includes both classic hooks rules and the compiler rules: component-hook-factories, config, error-boundaries, gating, globals, immutability, incompatible-library, preserve-manual-memoization, purity, refs, set-state-in-effect, set-state-in-render, static-components, unsupported-syntax, use-memo. <https://react.dev/reference/eslint-plugin-react-hooks>
It works without typescript-eslint type info, so TS 7 does not block this rule set under ESLint. [I]

---

## 3. Import boundary rules

### Oxlint [P]
- Rule: `no-restricted-imports` (ESLint core port, restriction category, native). Options `paths` (exact module, supports `importNames`, `allowImportNames`, `allowTypeImports`, `message`) and `patterns` (gitignore-style `group` or Rust `regex`, plus `importNamePattern`, `allowImportNamePattern`, `allowTypeImports`, `caseSensitive`, `message`). Covers static imports and `import("literal")`, not computed `import(x)`. <https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-restricted-imports.html>
- Type-only: `allowTypeImports: true` permits `import type` and `export type ... from`. Source confirms it exists on both `RestrictedPath` and `RestrictedPattern`; the check uses a per-entry `is_type` flag. <https://github.com/oxc-project/oxc/blob/main/crates/oxc_linter/src/rules/eslint/no_restricted_imports.rs>
- Per-directory scoping: `overrides: [{ files: [glob...], rules: {...} }]`. <https://github.com/oxc-project/website/blob/main/src/docs/guide/usage/linter/config.md>
- Caveat [P]: overrides do not merge rule options across entries. Maintainers say use a TS config (`oxlint.config.ts` with `defineConfig`) and spread a shared base. Open feature request for merging across folders: <https://github.com/oxc-project/oxc/issues/20881>.
- Caveat [P]: patterns match the import *specifier string*, not the resolved file path. [I] That means relative imports (`../../server/x`) need patterns like `**/server/**`, and a path alias (`@server/*`, `@client/*`, `@shared/*` via tsconfig and Vite) makes rules far simpler and more reliable. Test with a fixture.

Sketch for this repo [I, untested]:
```ts
// oxlint.config.ts
import { defineConfig } from "oxlint";
const server = { group: ["@server/**", "**/server/**"], message: "client must not import server" };
export default defineConfig({
  overrides: [
    { files: ["src/client/**"],
      rules: { "no-restricted-imports": ["error", { patterns: [server, { group: ["hono", "hono/**", "drizzle-orm", "drizzle-orm/**", "pg"] }] }] } },
    // the single client file allowed to import server types only
    { files: ["src/client/api-types.ts"],
      rules: { "no-restricted-imports": ["error", { patterns: [{ ...server, allowTypeImports: true }, { group: ["hono", "hono/**", "drizzle-orm", "drizzle-orm/**", "pg"] }] }] } },
    { files: ["src/shared/**"],
      rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["hono", "hono/**", "pg", "pg/**", "drizzle-orm", "drizzle-orm/**"] }] }] } },
    // one App folder must not import another: one override per App with
    // patterns for every sibling, generated in TS from a list of folder names
  ],
});
```
Notes: shared must also not be allowed type imports from those packages if the intent is a hard ban, so no `allowTypeImports` there. "App A must not import App B" has no wildcard-negation form, so generate one override per App from a list (that is what the `oxlint.config.ts` format is for). [I]
- Type-aware or resolver-based boundary rules (`import/no-restricted-paths`, `eslint-plugin-boundaries`): the Oxlint rules index I read shows no native equivalent. The `import` plugin tracker is still an open umbrella: <https://github.com/oxc-project/oxc/issues/1117>. [U] whether `import-x/no-restricted-paths` loads as a JS plugin. The conformance-tested list in the JS plugin docs does not include `import-x` or `boundaries`.

### Biome [P]
- Rule: `style/noRestrictedImports` since 1.6.0; `patterns` (gitignore style) since 2.2.0; `importNamePattern` and `invertImportNamePattern` since 2.2.0. Options struct has only `paths` and `patterns`; path options are `message`, `importNames`, `allowImportNames`. **No `allowTypeImports` or any type-only switch.** <https://biomejs.dev/linter/rules/no-restricted-imports/>, <https://github.com/biomejs/biome/blob/main/crates/biome_rule_options/src/no_restricted_imports.rs>
- Per-directory scoping works through `overrides[].includes` plus `overrides[].linter.rules`. Last matching override wins for single-value settings. <https://biomejs.dev/reference/configuration/>
- So Biome can do "client must not import server" and "shared must not import hono/pg/drizzle-orm", but **cannot** express "except type-only imports in one file" as a type-only allowance. [I] A workaround is to exempt that single file entirely via an override that turns the rule off, losing protection on its value imports.
- Other boundary-ish rule: `correctness/noPrivateImports`, driven by JSDoc `@public/@package/@private`, not directory globs. <https://github.com/biomejs/biome/blob/main/crates/biome_js_analyze/src/lint/correctness/no_private_imports.rs>

---

## 4. Banning specific syntax (e.g. `new Date(<string>)`)

### Oxlint
- No native `no-restricted-syntax`: the rules index lists `no-restricted-exports`, `no-restricted-globals`, `no-restricted-imports`, `no-restricted-properties` (v1.63.0), `no-restricted-types` (typescript), and not `no-restricted-syntax`. [P: <https://github.com/oxc-project/oxc/blob/main/crates/oxc_linter/src/rules.rs>, <https://oxc.rs/docs/guide/usage/linter/rules.html>]
- Route: `oxlint-plugin-eslint` ("ESLint's built-in rules as an Oxlint plugin", npm 1.88.0) loaded as a JS plugin. JS plugins are **alpha**, support ESLint selectors, and do not support type-aware rules. <https://oxc.rs/docs/guide/usage/linter/js-plugins.html>; npm metadata via `npm view oxlint-plugin-eslint`.
- Gotcha [P]: the name `eslint` is reserved, so the string form fails ("Plugin name 'eslint' is reserved"). Users report the alias form works: `{ "name": "eslint-js", "specifier": "oxlint-plugin-eslint" }`, then `"eslint-js/no-restricted-syntax"`. <https://github.com/oxc-project/oxc/issues/23695> (fix PR #23915 referenced there; status not checked).
- [I] Selector for the question: `NewExpression[callee.name='Date'][arguments.0.type='Literal']` for string literals; for identifiers add `[arguments.0.type='Identifier']`. This is plain ESLint selector syntax (<https://eslint.org/docs/latest/extend/selectors>) and I did not run it in Oxlint. It cannot tell whether a variable is a string without type info.
- A type-aware ban needs a custom rule with type info, which Oxlint JS plugins do not support.

### Biome
- GritQL plugins, registered under top-level `plugins` (path to `.grit`), with optional `includes` globs and `overrides[].plugins`. Targets JS, CSS and JSON. `register_diagnostic(span, message, severity)` is required. <https://biomejs.dev/linter/plugins/>, <https://biomejs.dev/reference/configuration/>
- [I, untested] sketch: ``\`new Date($arg)\` as $d where { register_diagnostic(span = $d, message = "...", severity = "error") }``. Constraining `$arg` to string literals or non-literals would use Grit predicates; I did not verify the exact syntax.
- Biome nursery also has `noJsRestrictedProperties`, and style has `noRestrictedGlobals` / `noRestrictedTypes`. Not syntax-level.

### ESLint (for comparison) [P]
Core `no-restricted-syntax` with selectors, and full type-aware custom rules. <https://eslint.org/docs/latest/rules/no-restricted-syntax>

---

## 5. Biome 2.5.x and TypeScript 7

- **[U] No primary statement of TS 7 compatibility found.** Searched `biomejs/biome` issues for "TypeScript 7", "TypeScript 7.0", "tsgo" and "typescript-go": nothing about compatibility. Docs pages for domains and language support do not mention TS versions. <https://biomejs.dev/linter/domains/>, <https://biomejs.dev/internals/language-support/>
- What is primary: Biome has its own JS/TS parser, formatter and module graph in Rust (`biome_js_parser`, `biome_js_analyze`, `biome_module_graph`), and its type-aware rules use Biome's own inference, not the `typescript` package. (Crate listing: <https://github.com/biomejs/biome/tree/main/crates>.) The linter docs describe an "inference engine" without naming TypeScript. <https://biomejs.dev/linter/domains/>
- [I] Because of that, TS 7.0.2 being API-less should not affect Biome's operation. The residual risks are (a) TS syntax newer than Biome's parser knows (parser fixes are being filed, e.g. <https://github.com/biomejs/biome/issues/11763>, `override accessor` ordering, closed) and (b) its inference diverging from `tsc`. Biome's type-aware rules are also "nursery" and produce regressions, e.g. <https://github.com/biomejs/biome/issues/12176> (`useAwaitThenable`, open) and <https://github.com/biomejs/biome/issues/11376> (type-inference rules ~20x slower in 2.5.8, closed).
- Markdown: parsing and formatting listed "In progress", linting "Not started". CSS and JSON formatting supported. <https://biomejs.dev/internals/language-support/>
- Tailwind: formatter does not sort classes; nursery lint rule `useTailwindSortedClasses` exists (not recommended, unsafe fix). <https://github.com/biomejs/biome/blob/main/crates/biome_js_analyze/src/lint/nursery/use_tailwind_sorted_classes.rs>

---

## 6. Is ESLint + TS 6 alias the only route to typed linting under TS 7?

**No, but it is the only route for typescript-eslint.**

- typescript-eslint does not support TS 7. Maintainer: "typescript-eslint isn't compatible with TS 7 at this time, because there is no TS 7 API at this time" and "there is currently no stable JS API." <https://github.com/typescript-eslint/typescript-eslint/issues/12518>, <https://github.com/typescript-eslint/typescript-eslint/issues/10940>
- TypeScript's own guidance: 7.0 "does not ship with an API"; 7.1 is expected to ship a new, different one; meanwhile install the compat package `@typescript/typescript6` and alias it: `"typescript": "npm:@typescript/typescript6@^6.0.2"` plus `"@typescript/native": "npm:typescript@^7.0.2"` to keep TS 7's `tsc`. <https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0>
- In progress: typescript-eslint PR #12803 adds an opt-in `projectService: { EXPERIMENTAL_backend: 'native' }` for TypeScript 7.1 over IPC; open, last updated 2026-10-08. A maintainer's 2026-09-29 status says it is "looking more and more stable" and not expected to be much faster than TS 6. <https://github.com/typescript-eslint/typescript-eslint/pull/12803>, <https://github.com/typescript-eslint/typescript-eslint/issues/10940>. Also requires TS 7.1, which I did not find released (typescript-go releases show only 7.0.2 as of today; npm `typescript` dist-tags I did not inspect).
- **Alternative: Oxlint type-aware linting.** Requires `oxlint-tsgolint` and "TypeScript 7.0+ is required"; powered by `typescript-go`; "supports 59 out of 61 type-aware rules from typescript-eslint"; flags `--type-aware`, `--type-check` (experimental; can replace a separate `tsc --noEmit` step); stability notes: incomplete coverage, possible high memory on very large codebases; unsupported legacy tsconfig options such as `baseUrl`; options deprecated in TS 6 or removed in 7 must be migrated. `options.typeAware` and `typeCheck` are root-config only. <https://oxc.rs/docs/guide/usage/linter/type-aware.html>
- Custom type-aware *rules* are not possible in Oxlint JS plugins (limitation noted in the JS plugin docs). So "ban a syntax depending on the argument's type" stays an ESLint-with-TS6 job. [I]

---

## What this suggests (inference, not requested but relevant)

- A coherent TS 7 stack exists without ESLint: Oxlint (React Compiler rules + `no-restricted-imports` + type-aware via tsgolint) plus Oxfmt (Tailwind sorting, native TS/CSS/JSON/MD). Gaps: no native `no-restricted-syntax` (alpha JS plugin workaround), Oxfmt is 0.x, Oxlint JS plugins alpha.
- Biome is weaker for the stated needs: no type-only exemption in `noRestrictedImports`, no Markdown formatting yet, React Compiler rule is a single nursery rule, TS 7 compatibility undocumented. It is stronger for GritQL syntax bans.
- Two things to verify by running on the real repo before committing to a stack: Oxfmt on the Tailwind v4 stylesheet, and the `no-restricted-imports` patterns against the actual import style (relative vs alias).

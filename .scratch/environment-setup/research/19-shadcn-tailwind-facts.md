# 19 - shadcn / Tailwind facts (verified 2026-10-14)

Legend: **[P]** = read from a primary source (docs, first-party repo, npm registry metadata, published package source). **[E]** = empirical, I ran it in a throwaway project outside the repo (scratchpad; nothing in this repo was scaffolded). **[I]** = inference, not stated by any source.

Versions observed on npm `latest` today: tailwindcss / @tailwindcss/vite 4.3.3, vite 8.3.4, shadcn 4.21.5, react-day-picker 10.0.2, date-fns 4.4.0, @date-fns/tz 1.5.0, zod 4.6.7, typescript 7.0.2, @vitejs/plugin-react 6.1.2, babel-plugin-react-compiler 1.0.0, eslint-plugin-react-hooks 7.1.1, prettier 3.9.10, prettier-plugin-tailwindcss 0.8.1, oxfmt 0.73.0, @biomejs/biome 2.5.15, @tanstack/react-form 1.33.5, radix-ui 1.8.1, @base-ui/react 1.9.0. [P: registry.npmjs.org]

## 1. Tailwind major, Vite 8 compatibility, browser floor

- Current major is **v4** (docs header shows v4.3; npm latest 4.3.3). [P: https://tailwindcss.com/docs/installation/using-vite, https://registry.npmjs.org/tailwindcss/latest]
- `@tailwindcss/vite@4.3.3` declares `peerDependencies.vite: "^5.2.0 || ^6 || ^7 || ^8"`, so Vite 8.3.4 is in range. [P: https://registry.npmjs.org/@tailwindcss/vite/latest]. Install is `npm i tailwindcss @tailwindcss/vite`, add `tailwindcss()` to `plugins`, and `@import "tailwindcss";` in the CSS. [P: https://tailwindcss.com/docs/installation/using-vite]
- Verified [E]: tailwindcss 4.3.3 + @tailwindcss/vite 4.3.3 + vite 8.3.4 install cleanly together (no peer errors). I did not run a Vite build.
- Browser floor stated by Tailwind: **Chrome 111, Safari 16.4, Firefox 128**. The page says nothing explicit about iOS; Safari 16.4 is shipped as iOS 16.4. Newer features (`field-sizing: content`, `@starting-style`, `text-wrap: balance`) have narrower support. [P: https://tailwindcss.com/docs/compatibility]
- [I] For an installed iOS PWA the effective floor is therefore iOS/iPadOS 16.4+ (iOS PWAs use the system WebKit, so the OS version is the browser version). The iOS-equals-Safari mapping is my inference, not a Tailwind statement.

## 2. shadcn 4.x init for Vite without `baseUrl`

Short answer: **yes, it works, provided `paths` is set in the ROOT `tsconfig.json`.** Putting it only in `tsconfig.app.json` fails.

- Official docs still tell you to add `baseUrl: "."` plus `paths` to both `tsconfig.json` and `tsconfig.app.json`. [P: https://ui.shadcn.com/docs/installation/vite] That advice is stale for TS 7.
- shadcn's own Vite template uses **`paths` only, no `baseUrl`**, in both `tsconfig.json` and `tsconfig.app.json` (`"@/*": ["./src/*"]`), and the alias in `vite.config.ts` is `resolve.alias["@"] = resolve(import.meta.dirname, "./src")` with `plugins: [react(), tailwindcss()]`. [P: https://github.com/shadcn-ui/ui/tree/main/templates/vite-app (tsconfig.json, tsconfig.app.json, vite.config.ts)]
- CLI source (shadcn 4.21.5 + @shadcn/registry 0.1.4, read from the published tarballs): alias detection calls `tsconfig-paths` `loadConfig(cwd)` and, if that yields no paths, falls back to parsing `tsconfig.json`, `tsconfig.web.json`, `tsconfig.app.json` directly; it picks the `paths` key whose target is `./*`, `./src/*`, `./app/*` or `./resources/js/*`. It never requires `baseUrl`. It also supports package.json `imports` (`#alias`) as an alternative. [P: npm tarballs `shadcn@4.21.5`, `@shadcn/registry@0.1.4`; this is code reading, not a doc]
- [E] shadcn 4.21.5 in a throwaway Vite-shaped project, `paths` only, **no baseUrl**, TS 5.9 (TS 7 not tested):
  - `paths` only in `tsconfig.app.json` (root tsconfig = `files: []` + references): `shadcn info` reports `importAlias @`, `init` writes `components.json`, then **fails**: "Could not load the workspace config ... configure its path aliases".
  - `paths` also in root `tsconfig.json` (as the official template does): `init -y -b radix -p nova` **succeeds** (writes components.json, `src/lib/utils.ts`, updates `src/index.css`, installs deps). `shadcn add calendar field input popover` and several more also succeeded.
- Known open bug matching the first failure: "shadcn CLI doesn't resolve tsconfig.app.json", #11466, open, fix PR #11469 open (as of 2026-10-14). [P: https://github.com/shadcn-ui/ui/issues/11466]. Workaround = duplicate `paths` into root `tsconfig.json`.
- Not tested: the `baseUrl`-is-a-hard-error TS 7 compiler itself, and a real `vite build`. The CLI does not read TypeScript's own diagnostics, so TS 7 should be irrelevant to it [I].

### Presets / styles / base

- `init` options: `-t/--template next|vite|start|react-router|laravel|astro`, `-b/--base base|radix|aria`, `-p/--preset [name]`, `-y`, `-d/--defaults` (= `--template=next --preset=nova`), `-f`, `-c`, `-n`, `--css-variables`, `--rtl`, `--pointer`, `--monorepo`, `--reinstall`. There is no `--style` flag. [P: https://ui.shadcn.com/docs/cli]
- CLI v4 (March 2026): presets are short codes capturing the whole design system (colors, theme, icon library, fonts, radius); `init --template vite` includes dark mode; `--base` picks primitives; new `info`/`docs`/`--dry-run`/`--diff`. [P: https://ui.shadcn.com/docs/changelog/2026-03-cli-v4]
- Styles named in changelog titles/docs: Nova (the `--defaults` preset; my run wrote `"style": "radix-nova"` into components.json), Luma (March 2026, "inspired by macOS Tahoe, minus the glass"), Sera (April), Rhea (May). I did not find a complete list of styles on a primary page; do not assume others exist. [P: https://ui.shadcn.com/docs/changelog, https://ui.shadcn.com/docs/changelog/2026-03-luma, [E] components.json]
- **Base UI is now the default** for new projects (July 2026). `init -b radix` selects Radix. Radix is explicitly not deprecated; all updates ship for both. Documented difference: `asChild` becomes `render`; the post lists no further component-level differences. Existing apps can stay; migration is per component via a skill. [P: https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default]
- Radix side now installs the unified `radix-ui` package (Feb 2026 "Unified Radix UI Package"). [E: package.json after init had `radix-ui ^1.8.1`; changelog title]. Base UI package is `@base-ui/react` 1.9.0 (stable since v1.0.0, 2025-12-11). [P: https://base-ui.com/react/overview/releases]
- [I] Newly generated utils: shadcn 4.21 writes `src/lib/utils.ts` as `export { cn } from "cn"` and components import `cn` from the `cn` package (September 2026 changelog: "cn" moved into its own package, `migrate cn` command exists). [E for what was generated; P for changelog title only, I did not read that entry]. Expect `cn` as a dependency.

## 3. Dark mode / theming on plain Vite

- Docs page "Dark mode - Vite": a `ThemeProvider` (`components/theme-provider.tsx`) storing the choice in `localStorage` (default key `vite-ui-theme`, default `system`), toggling `light`/`dark` classes on `<html>`, a `useTheme` hook, and a `ModeToggle` dropdown (Light/Dark/System). **The docs page does not address flash avoidance.** [P: https://ui.shadcn.com/docs/dark-mode/vite]
- The current official template's `theme-provider.tsx` reads storage in the `useState` initializer (no try/catch), applies the class in a **`useEffect` (not layout effect)**, listens to `prefers-color-scheme` only when theme is `system`, syncs across tabs via `storage` events, and can disable transitions during switch. The template's `index.html` as fetched has no theme script (summary of the fetch; I could not get the verbatim file). So the stock setup can paint one frame in the wrong theme. [P: https://github.com/shadcn-ui/ui/blob/main/templates/vite-app/src/components/theme-provider.tsx; the "may flash" conclusion is [I]]
- Generated CSS (shadcn init) uses `@custom-variant dark (&:is(.dark *));`, `:root` and `.dark` blocks of oklch CSS variables, `@theme inline` mapping. [E: generated `src/index.css`]
- Tailwind's own recommended anti-FOUC method: class strategy with `@custom-variant dark (&:where(.dark, .dark *));` and an **inline script in `<head>`** that toggles `dark` from `localStorage.theme` or `matchMedia("(prefers-color-scheme: dark)")`. [P: https://tailwindcss.com/docs/dark-mode]
- [I] Recommendation: keep shadcn's provider but add the inline head script in `index.html`, using the same storage key as the provider (`vite-ui-theme` stores `light|dark|system`, not Tailwind's `theme` key, so the script must match shadcn's value format), and set `<meta name="theme-color">` for PWA chrome. shadcn's `:is(.dark *)` variant does not match the `.dark` element itself; Tailwind's `:where(.dark, .dark *)` does. Prefer whichever you test; shadcn components work with either.

## 4. Forms: TanStack Form + Zod

- shadcn has an official **TanStack Form** guide (alongside react-hook-form), using `useForm` from `@tanstack/react-form`, `<form.Field>`, shadcn `Field`/`FieldError` components, and `validators: { onSubmit: schema }` (also `onChange`/`onBlur`). Invalid controls get `aria-invalid`, `Field` gets `data-invalid`. [P: https://ui.shadcn.com/docs/forms/tanstack-form]
- The shadcn example says it uses **zod v3**. TanStack Form states it supports Standard Schema libraries by passing the schema directly to `validators.*`, and says to use the latest schema library versions; it does not name Zod versions. Zod 4 implements Standard Schema, so it should work [I - Zod 4 compliance is from my background knowledge; not re-verified here]. Notes from TanStack: schema validation does not return transformed values; form-level schema `errorMap.onChange` is keyed by field name. [P: https://tanstack.com/form/latest/docs/framework/react/guides/validation]
- So the answer is not "react-hook-form only".

## 5. React Compiler compatibility

- Official Vite setup with `@vitejs/plugin-react` >= 6: `react()` plus `@rolldown/plugin-babel` with `presets: [reactCompilerPreset()]`; the inline `babel` option was removed in plugin-react 6. Compiler works by default on React 19. ESLint rules come from `eslint-plugin-react-hooks` (`recommended-latest`). A flagged component is skipped, not broken. [P: https://react.dev/learn/react-compiler/installation]
- shadcn's Vite template does not enable the compiler (no mention in the template listing/README fetched). [P, absence only]
- [E] I ran `babel-plugin-react-compiler@1.0.0` (npm latest) over shadcn 4.21.5 radix-nova output for: button, calendar, carousel, dialog, drawer, field, input, label, popover, select, separator, sheet, sidebar, skeleton, sonner, tabs, tooltip. Everything compiled with zero diagnostics **except `calendar.tsx`**: two `CompileError: Handle tagged template where cooked value is different from raw value`, caused by `String.raw\`...\\_next...\`` class strings (lines ~35-36). Per the docs that means the compiler skips the affected function(s) (the calendar component) and leaves it uncompiled; it does not break. I did not test runtime behavior or the Base UI variant.
- Known shadcn issues touching the compiler: carousel triggers the lint rule `react-hooks/set-state-in-effect` (#10564, open, PR #10612 open); `useIsMobile` hook flagged similarly (PR #8741 and #10927 open). These are ESLint findings in shadcn source, not runtime bugs. [P: https://github.com/shadcn-ui/ui/issues/10564, https://github.com/shadcn-ui/ui/issues?q=React+Compiler]
- Primitives (Radix, Base UI) are prebuilt in node_modules and are not compiled by your Babel step unless you opt in. I found no official statement from Radix or Base UI about React Compiler (Base UI release notes do not mention it) and no documented incompatibility. [P: absence of evidence, https://base-ui.com/react/overview/releases]. A blog post (secondary, anecdotal) reports a Dialog parent not re-rendering on open with the compiler on; treat as unverified.

## 6. Calendar / date picker and date-fns

- `shadcn add calendar` pulls **react-day-picker ^10.0.2** and **date-fns ^4.4.0** into package.json. [E]
- `react-day-picker@10.0.2` declares `dependencies: { "date-fns": "^4.1.0", "@date-fns/tz": "^1.4.1" }`, peer `react >=16.8`. [P: https://registry.npmjs.org/react-day-picker/latest]. `npm ls` resolved one deduped `date-fns@4.4.0` and `@date-fns/tz@1.5.0`. [E] This matches your pins with no conflict.
- v10.0.0 (8 May 2026) removed deprecated props (`fromDate/toDate/fromMonth/toMonth/fromYear/toYear` -> `startMonth/endMonth/hidden`, `initialFocus` -> `autoFocus`, several `onDay*` handlers), moved non-Gregorian calendars to separate `@daypicker/*` packages. v10.0.2 is 30 Sep. [P: https://github.com/gpbl/react-day-picker/releases]. Check the generated `calendar.tsx` against these removals.
- shadcn Calendar docs: pass `timeZone` to DayPicker so display/selection use the user's zone (fixes off-by-one-day selection); compute zone inside `useEffect` to avoid hydration mismatch (irrelevant in an SPA). [P: https://ui.shadcn.com/docs/components/radix/calendar]
- [I] Because react-day-picker already depends on `@date-fns/tz`, the `TZDate`-based approach fits with your existing date-fns choice.

## 7. Tailwind class sorting

- **prettier-plugin-tailwindcss**: current 0.8.1; needs Prettier 3+; supports Tailwind v3 and v4. For v4, set `tailwindStylesheet` to your CSS entry (relative to the Prettier config); `tailwindFunctions` for `cn`, `cva`, `clsx`; must be **last** in `plugins`; ESM-only. shadcn's Vite template ships a `.prettierrc` with this plugin pointing to `src/index.css` and functions `cn`, `cva`. [P: https://github.com/tailwindlabs/prettier-plugin-tailwindcss, https://github.com/shadcn-ui/ui/blob/main/templates/vite-app/.prettierrc (summary)]
- **Oxfmt** (0.73.0): has built-in Tailwind sorting under `sortTailwindcss`, **disabled by default**, "based on prettier-plugin-tailwindcss"; options `stylesheet`, `functions` (e.g. `["clsx","cn"]`), `attributes`, `preserveWhitespace`; regex patterns for `attributes`/`functions` unsupported. The page doesn't state beta/stable or explicitly mention Tailwind v4, though the `stylesheet` option implies v4-style CSS entry [I]. [P: https://oxc.rs/docs/guide/usage/formatter/sorting.html]. Version is 0.x; I did not test it.
- **Biome** (2.5.15): `useSortedClasses` is still **nursery** ("behavior can change at any time"), since 1.6.0. Only default Tailwind config is supported (no custom utilities/plugins, no `prefix`), screen variants (`md:`) not sorted, docs never mention Tailwind v4, fix is unsafe and not auto-applied. [P: https://biomejs.dev/linter/rules/use-sorted-classes/]. Not suitable for a shadcn/v4 theme with custom `@theme` tokens [I].
- [I] Practical pick for a v4 + shadcn project: prettier-plugin-tailwindcss (only one that reads the real stylesheet and is documented for v4), or Oxfmt `sortTailwindcss` if you are standardising on Oxfmt, after testing it against your CSS.

## Sources not fetched / gaps

- The shadcn changelog entries for "shadcn preset", "Sera", "Rhea", "cn" (404 or not read), full Base UI vs Radix component differences, and the exact `components/base/calendar` page contents (truncated) were not read.
- TS 7 behavior of `shadcn init` not tested (used TS 5.9 in the throwaway project); no `vite build`; no runtime React Compiler test.

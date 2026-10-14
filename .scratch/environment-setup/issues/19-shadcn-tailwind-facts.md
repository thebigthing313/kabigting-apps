# Research: Tailwind and shadcn facts
Type: research
Status: resolved
Blocked by: none

## Question

Facts the Tailwind and shadcn setup ticket waits on, as of 2026-10-14:
1. Current Tailwind major version and its Vite plugin compatibility with Vite 8; minimum browser support (Safari/iOS) for an installed PWA.
2. shadcn 4.x: `init` for a Vite SPA without `baseUrl` (TS 7), current style options/presets, and the Radix vs Base UI primitive choice.
3. shadcn's recommended dark mode / theming setup for plain Vite (not Next.js).
4. Form story: does shadcn support TanStack Form + Zod (Standard Schema), or only react-hook-form?
5. React Compiler compatibility of shadcn components and their primitives.
6. Calendar/date picker dependency (react-day-picker and date-fns versions) vs our `date-fns` 4.4 pin.
7. Tailwind class sorting tooling (Prettier plugin, Oxfmt, Biome) status.

## Answer

Findings are on branch `research/shadcn-tailwind-facts` (commit 7cce15c), file `.scratch/environment-setup/research/19-shadcn-tailwind-facts.md`. Claims are tagged [P] primary, [E] empirical (run in a throwaway project, nothing in this repo), [I] inference. Agent output; not yet reviewed by the user.

- **Tailwind** is v4 (4.3.3). `@tailwindcss/vite` 4.3.3 supports Vite ^5.2 to ^8, so Vite 8.3.4 is fine. Browser floor: Safari 16.4, Chrome 111, Firefox 128 (iOS 16.4+ for an installed PWA is inference).
- **shadcn 4.21.5 `init`** works without `baseUrl` if `paths` is in the root `tsconfig.json` (tested with TS 5.9, not TS 7). With `paths` only in `tsconfig.app.json` it fails (open bug #11466). Base UI has been the default since July 2026; `-b radix` selects Radix (not deprecated); the main difference is `asChild` becoming `render`. Default `--preset` is nova; Luma, Sera and Rhea also exist. **Olive as a base colour was not checked.**
- **Dark mode:** shadcn's Vite ThemeProvider sets the class in `useEffect`, so first paint can show the wrong theme. Use an inline `<head>` script (per Tailwind's docs) that sets the class before paint and matches shadcn's `vite-ui-theme` storage key and value format.
- **Forms:** shadcn has an official TanStack Form guide (its example uses Zod v3). TanStack Form accepts any Standard Schema library; Zod 4 working is inference, not verified.
- **React Compiler:** `babel-plugin-react-compiler` 1.0.0 compiled 17 shadcn UI files without errors, except `calendar.tsx`, which is skipped (not broken) because of `String.raw` class strings. No documented Radix or Base UI incompatibility; runtime behaviour was not tested.
- **Calendar:** `shadcn add calendar` installs react-day-picker ^10.0.2 and date-fns ^4.4.0, which resolves to our date-fns 4.4.0 and `@date-fns/tz` 1.5.0. v10 removed several deprecated props; check the generated `calendar.tsx`.
- **Class sorting:** `prettier-plugin-tailwindcss` 0.8.1 is the documented v4 option (`tailwindStylesheet`, `tailwindFunctions`, must be last in `plugins`). Oxfmt `sortTailwindcss` is 0.x and untested. Biome's `useSortedClasses` is nursery.
- **Gaps:** shadcn `init` under TS 7; the preset, Sera, Rhea and `cn` changelog entries were not read.

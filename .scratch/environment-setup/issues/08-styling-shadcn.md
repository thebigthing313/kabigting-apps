# Grill: Tailwind and shadcn setup
Type: grilling
Status: resolved
Blocked by: 01

## Question

Settle Tailwind version, shadcn configuration, theming/dark mode, and base design tokens for the Shell.

## Interim decisions (user-confirmed; ticket stays claimed until research 19 lands and the accent colour is chosen)

- **Theme:** light, dark and follow-the-device, with a three-way toggle in the Shell. The choice is remembered in the browser; an inline script in `index.html` sets the theme before first paint. No `next-themes`.
- **Visual identity:** neutral or zinc base, one accent colour, shadcn's default radius, self-hosted Inter variable (`@fontsource-variable/inter`, no CDN), WCAG AA contrast as the floor. Negative amounts red and positive green, always paired with an explicit sign. **Open: the accent colour** (user did not name one).
- **Shell navigation:** shadcn's Sidebar (collapsible on desktop, drawer on mobile) with an App switcher at the top. Per-App navigation lives inside each App.
- **Design target (amended by the user):** mobile first, with real desktop adaptability, because data is sometimes managed on a desktop. Phone portrait is the primary layout; tablet/desktop layouts are first-class for data-management screens (wide tables, denser rows, keyboard-friendly editing), built with Tailwind's mobile-first breakpoints. Touch targets at least 44px; safe-area insets respected in the installed app.
- **Component gaps (amended by the user):** forms use **TanStack Form** with Zod; data tables use **TanStack Table** (chosen now, not deferred); toasts use Sonner; date picker uses shadcn Calendar (react-day-picker, which uses `date-fns`). Charts are deferred to the finances port. Confirm TanStack Form with shadcn in research 19.
- **`components/ui`:** lightly modified vendor code. Change tokens in the theme CSS rather than editing files; app-specific combinations (e.g. an amount input built from Input plus the `money` parser) go in `src/client/components/`; update by re-running the CLI and reviewing the diff.
- **Skeleton screens:** sign-in; forced change-password; Shell layout (sidebar, App switcher, theme toggle, sign-out); the `skeleton_notes` page; not-found and error pages; an "update available" prompt (ticket 12 decides how). No Admin screen, settings page or profile page.
- **Skeleton consequence of the amended choices:** the `skeleton_notes` page uses TanStack Form for create/edit and TanStack Table for the list, so the scaffold proves both under React Compiler and TS 7.

## Interim decision: base colour (user)

- **Base colour: Olive.** The user chose it directly. No separate accent colour: the primary colour comes from shadcn's Olive theme unless the user asks for one later (a single theme token). Research 19 must confirm that Olive is an available base colour in shadcn CLI 4.21.5 and how it is exposed; if it is not, come back to the user.
- Open now: only research 19's findings (Tailwind major, Radix vs Base UI, TanStack Form support, React Compiler compatibility).

## Research 19 has landed — remaining questions for the user

Ticket stays claimed. To settle: (1) Base UI (shadcn default) vs Radix (`-b radix`); (2) which preset (default `nova`); (3) confirm Olive exists as a base colour in CLI 4.21.5 (research did not check); (4) TanStack Form with Zod 4 is unverified, so keep it as a scaffold smoke test; (5) theme-flash script must match shadcn's `vite-ui-theme` storage key.

## Answer

Decided with the user. The interim decisions above stand, plus the research 19 questions (all accepted):

- **Base colour: Olive, confirmed.** shadcn's official theming docs list seven base colours (Neutral, Stone, Zinc, Mauve, Olive, Mist, Taupe) at https://ui.shadcn.com/docs/theming. `tailwind.baseColor` **cannot be changed after `init`** (https://ui.shadcn.com/docs/components-json), so the scaffold must run `init` with Olive from the start (directly or via a preset whose `baseColor` is `olive`). A third-party project reports the base colours differ only slightly in chroma; treat as unverified.
- **Primitives:** Base UI (shadcn's default since July 2026), not Radix. Code uses `render` where Radix used `asChild`.
- **Preset:** the default `nova`. At scaffold, look at the other presets (Luma, Sera, Rhea) side by side if the look matters.
- **Tailwind:** v4 (4.3.3) with `@tailwindcss/vite`; browser floor Safari 16.4 / Chrome 111 / Firefox 128.
- **shadcn init under TS 7:** `paths` must be in the root `tsconfig.json` (not only a referenced config), no `baseUrl` (open bug #11466 otherwise). Verify under TS 7 at scaffold.
- **Theme flash:** an inline `<head>` script sets the class before first paint, using shadcn's `vite-ui-theme` storage key from one shared constant, so the script and the provider cannot drift. The scaffold tests a first paint with dark mode saved.
- **Class sorting:** `prettier-plugin-tailwindcss` 0.8.1 with `tailwindStylesheet` and `tailwindFunctions`, listed last in `plugins`.
- **Smoke tests at scaffold time:** a sign-in form on TanStack Form with Zod 4; a rendered shadcn calendar (react-day-picker 10 with `date-fns` 4.4; `calendar.tsx` is skipped by React Compiler, not broken); `shadcn init` under TS 7. Fallbacks if any fail: Zod 3-style usage, or a different date input, brought back to the user.

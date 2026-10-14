# Research: Date library choice
Type: research
Status: resolved
Blocked by: none

## Question

Is the native `Temporal` API usable today (browser support in current Chrome, Firefox, Safari; TypeScript 7 typings; polyfill need) for plain dates (`YYYY-MM-DD`), instants, and `America/New_York` month boundaries? If not, is `date-fns` (with `@date-fns/tz`) the better choice? Report a recommendation and the evidence. Context: see Money and dates decisions in `issues/11-money-and-dates.md`.

## Answer

Findings are on branch `research/date-library` (commit 8a6062b), file `.scratch/environment-setup/research/17-date-library.md`. Agent output; not yet reviewed by the user.

- Recommendation: `date-fns` 4.4.0 + `@date-fns/tz` 1.5.0, hidden behind one `dates` module so a later move to Temporal is a one-file swap.
- Native Temporal: Firefox 139 and Chrome/Edge 144 ship it and the TC39 proposal is Stage 4, but stable Safari/iOS Safari do not (only Safari Technology Preview 249). About 70% global support per caniuse; the agent found no stable Safari release note, so re-check before treating this as final.
- TypeScript 7.0.2 ships `lib.esnext.temporal.d.ts`, but types are not a runtime, so Safari would need a polyfill (`@js-temporal/polyfill` 0.5.1 or `temporal-polyfill` 1.0.6).
- Both approaches computed the correct New York month boundary for the instant 2026-11-01T03:30Z (2026-10-01T00:00-04:00).
- With `date-fns`: keep `YYYY-MM-DD` as strings, never use `new Date('YYYY-MM-DD')` (parses as UTC midnight), and compute month ranges as half-open intervals in the household zone.

Needs the user's confirmation before the Money and dates provisional item is locked.

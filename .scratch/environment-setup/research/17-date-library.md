# 17 - Date library: native Temporal vs date-fns (+ @date-fns/tz)

Researched 2026-10-14. Context: Vite + React family finance PWA; Postgres `date` and `timestamptz` (UTC); single household zone America/New_York.

## Recommendation

Use **date-fns v4 + @date-fns/tz** now. Do not depend on native Temporal yet.

- Native Temporal is not usable without a polyfill because stable Safari (and iOS Safari, which is the likely PWA install target for a family app) does not ship it. A PWA cannot choose the engine on iOS.
- A Temporal polyfill would be the real alternative. It is viable, but it is a runtime dependency with its own size and a pre-1.0 version (`@js-temporal/polyfill` 0.5.1). It is the better long-term target.
- Keep the date logic behind one small module (`lib/dates.ts`) so the later swap to native Temporal is a one-file change. Revisit when stable Safari ships Temporal.

## Evidence

### Standard and browser support

| Engine | Status | Source |
|---|---|---|
| TC39 | Stage 4 | [tc39/proposal-temporal](https://github.com/tc39/proposal-temporal) |
| Firefox | 139 (2025-05-27) | proposal repo above; [caniuse](https://caniuse.com/temporal) (135-138 behind flag) |
| Chrome/Edge | 144 (2026-01-13) | proposal repo; caniuse (Chrome Android 154) |
| Safari / iOS Safari | **Not in stable.** Only Safari Technology Preview: "Added support for the `Temporal` object" in [STP 249, 2026-07-29](https://webkit.org/blog/18182/release-notes-for-safari-technology-preview-249/). caniuse lists Safari 27-27.2 as unsupported, TP supported. | caniuse; WebKit blog |
| Node | 26 (2026-05-05); local Node 22.17.1 has no `Temporal` | proposal repo |

- caniuse global support was about 70%, so roughly 30% of users would hit the polyfill path.
- [MDN Temporal](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal) marks it "Limited availability" (not Baseline) and suggests runtime detection plus `@js-temporal/polyfill`.
- Caveat: the Safari stable status comes from caniuse (cached page) plus the STP note. I did not find a stable Safari release note mentioning Temporal. Re-check [caniuse](https://caniuse.com/temporal) before deciding. If Safari 27.x stable has shipped it by then, native becomes viable on current devices (older iOS still needs the polyfill).

### TypeScript 7 typings

- TypeScript 7.0 was announced 2026-07-08 ([blog](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)). npm `typescript` latest is 7.0.2 (checked with `npm view`).
- Built-in Temporal types arrived in TS 6.0 (2026-03-23, [blog index](https://devblogs.microsoft.com/typescript/)) as lib `esnext.temporal`.
- I verified directly that the TS 7.0.2 platform package (`@typescript/typescript-win32-x64`) ships `lib/lib.esnext.temporal.d.ts` (defines `PlainDate`, etc.), and `lib.esnext.d.ts` references it. The TS 7 announcement does not mention Temporal; it is a lib file, not a feature change.
- Config: `"lib": ["esnext"]` or `"lib": ["ES2023", "DOM", "esnext.temporal"]`. Note TS 7 defaults `types` to `[]` and `strict` to true.
- Typings only describe the global. The types give no runtime, so a polyfill that installs the global is still needed on Safari. `temporal-polyfill` (README) says TS >= 6.0 users add `esnext.temporal` to `lib` ([README](https://cdn.jsdelivr.net/npm/temporal-polyfill@1.0.1/README.md)). `@js-temporal/polyfill` exports its own types and is imported as a module, which avoids global-type clashes.

### Polyfills (npm, checked 2026-10-14)

- `@js-temporal/polyfill` 0.5.1 (referenced by MDN as the official polyfill).
- `temporal-polyfill` 1.0.6 (smaller, fullcalendar-maintained; 1.x).

### date-fns

- date-fns 4.4.0 latest (5.0.0-alpha exists, ignore). `@date-fns/tz` 1.5.0. Both from `npm view`.
- Time zone support: the `in` option with `tz("IANA")` works from date-fns v4, and `TZDate` is a Date subclass that computes in a zone ([date-fns/tz README](https://github.com/date-fns/tz)).
- Runtime test (scratchpad, date-fns 4.4.0 + tz 1.5.0, Node 22), instant `2026-11-01T03:30:00Z` (which is 2026-10-31 23:30 in New York):
  - `startOfMonth(i, {in: tz('America/New_York')})` gave `2026-10-01T00:00:00.000-04:00`.
  - `endOfMonth(...)` gave `2026-10-31T23:59:59.999-04:00`.
  - Correct: the October boundary, not UTC November.
- Same case with `@js-temporal/polyfill` 0.5.1: `toZonedDateTimeISO('America/New_York').with({day:1}).startOfDay()` gave `2026-10-01T04:00:00Z`; `+1 month` gave `2026-11-01T04:00:00Z`. `PlainDate.from('2026-03-31').add({months:1})` gave `2026-04-30` (clamps). So Temporal also gets it right.

## How each fits the data model

| Need | Temporal | date-fns + tz |
|---|---|---|
| Postgres `date` (`YYYY-MM-DD`) | `Temporal.PlainDate` - exact type match, no zone | Keep as **string**; do arithmetic by parsing as local `new Date(y, m-1, d)` or `parseISO`. Never `new Date('YYYY-MM-DD')` (parses as UTC midnight, shifts a day in NY). Easy to get wrong. |
| `timestamptz` instant | `Temporal.Instant` | native `Date` / ISO string |
| NY month boundary | `ZonedDateTime.startOfDay()`, DST-safe | `startOfMonth(d, {in: tz(NY)})`, then `.toISOString()` for query bounds (verified above) |
| Bundle | native: 0 KB; polyfill adds tens of KB | `TZDateMini` ~0.9 KB, `TZDate` ~1.2 KB, date-fns tree-shakes |

Temporal's `PlainDate` is a better model. date-fns has no date-only type, so wrap it: keep `YYYY-MM-DD` strings at the boundary and convert in one module.

## Suggested pattern (not scaffolded)

- Store/transport dates as `YYYY-MM-DD` strings and instants as ISO UTC strings.
- One `dates.ts` exporting `HOUSEHOLD_TZ = 'America/New_York'`, `monthRange(yyyyMm)` returning half-open `[startInstant, nextStartInstant)` for `timestamptz` queries, and `monthRangeDates` returning `YYYY-MM-DD` bounds for `date` columns.
- Use half-open ranges, not `endOfMonth` at 23:59:59.999.
- Do the month-range computation in the household zone, not the browser's zone, so a traveling device gives the same result.

## Open items

- Re-check stable Safari Temporal status before the decision is final (see caveat).
- No sources found for performance or bundle-size numbers of the Temporal polyfills; measure with the Vite build if it matters.

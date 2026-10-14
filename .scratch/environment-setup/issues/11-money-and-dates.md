# Grill: Money and dates
Type: grilling
Status: resolved
Blocked by: none

## Question

Decide how money is stored and computed (integer minor units vs numeric), currency handling, and timezone/date conventions across Postgres, API, and client.

## Answer

Decided with the user (Q1, Q5 answered directly; Q2–Q4 and Q6–Q8 accepted as recommended).

- **Currency:** USD only, two decimals, defined once as a constant. No currency column, no FX.
- **Storage:** `bigint` in minor units (cents); Drizzle `number` mode. Wire format is an integer-cents `number`, never a decimal string.
- **Arithmetic:** integer-only. One shared `money` helper owns rounding (half-up) and an allocate-without-losing-cents function for splits. No decimal library.
- **Sign:** amounts are **signed**: outflows negative, inflows positive, so a balance is a plain sum. A `kind` column (e.g. `transfer`) is added only where the sign alone is ambiguous. This deliberately departs from the original Access database, which used unsigned amounts plus an explicit type.
- **Dates:** transaction dates, billing days and budget period boundaries are calendar `date` values (no timezone). `created_at`/`updated_at` and true moments are `timestamptz` in UTC. One household timezone, `America/New_York`, defined once and used on server and client for "today", "this month" and period boundaries.
- **Wire format:** dates as `YYYY-MM-DD`, instants as ISO-8601 UTC strings.
- **Display/input:** `Intl.NumberFormat` with `en-US`. Amount fields take typed decimals ("1,250.50"), parsed strictly (reject more than two decimals), converted to cents on blur. Parser and formatter live in the `money` helper.
- **Provisional:** the date library (Temporal vs `date-fns` vs `Intl` helpers) is not locked. See the research ticket "Research: Date library choice".
- **Consequence:** the Access data migration will need to convert unsigned amount + type into signed amounts. That belongs to the finances port, not this map.

## Update

The date library is confirmed by the user: `date-fns` 4.4.0 + `@date-fns/tz` 1.5.0 behind one `dates` module (see "Research: Date library choice"). Keep `YYYY-MM-DD` as strings, never `new Date('YYYY-MM-DD')`, and compute month ranges as half-open intervals in `America/New_York`.

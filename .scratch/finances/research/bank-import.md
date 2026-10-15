# Research: bank import options for the Finances App

Answers issue #17 (a child of the map, #15). This covers the realistic ways to get actual
transactions from US banks and card issuers into a self-hosted Hono + Postgres PWA for one
household, deployed on Railway, and what each way means for reconciling expected (scheduled)
transactions against actual ones.

Researched 2026-10-14. Prices, limits and terms change, so check them again before relying on
them. Each claim cites its source. Anything marked **unverified** could not be traced to a
primary source.

## Summary

| Option                    | Cost (household scale)            | Effort to set up                                                                  | Freshness                           | Stable id                                                    | Pending                                                                          |
| ------------------------- | --------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| CSV export                | Free                              | A parser for each issuer's layout; manual download                                | Whenever someone downloads a file   | Usually none                                                 | Usually left out; varies by issuer                                               |
| OFX / QFX export          | Free                              | One parser for every issuer; manual download                                      | Whenever someone downloads a file   | `FITID`, unique per account (spec)                           | Separate `STMTTRNP` with no id; "should NEVER be stored" (spec)                  |
| SimpleFIN Bridge          | $1.50/month or $15/year           | Paste one token; Basic-auth HTTP GET                                              | About daily; about 24 requests/day  | `id`, never reused within an account (spec)                  | Opt-in `pending=1`; whether each bank supports it is unclear                     |
| Teller (development tier) | Free up to 100 enrollments        | mTLS client certificate on Railway; embed Teller Connect                          | On request                          | `id`, usually kept from pending to posted                    | `status: pending`/`posted`; sometimes a new id                                   |
| Plaid (trial)             | Free for 10 Items, then paid      | Dashboard compliance steps; extra registration with some OAuth banks; Link widget | 1 to 4 checks a day, plus webhooks  | `transaction_id`                                             | Pending is removed and posted is added with a new id, linked by `pending_transaction_id` |

## 1. File exports

### CSV

There is no standard. Each issuer picks its own columns, sign convention (one signed amount, or
separate debit and credit columns), date format and description text. Most exports have some of
these: transaction date, post date, description, amount (or debit/credit), category, type, and
sometimes a running balance or check number. **Unverified**, because no primary source covers
every issuer. The real layouts should be read from the household's own exports. Those files
stay private in the gitignored `exports/` folder.

What this means:

- CSV exports rarely have a transaction id, so de-duplication has to use a content hash such as
  account + date + amount + normalised description + an occurrence counter for same-day
  repeats. Two genuinely identical transactions on the same day (two identical coffees) are the
  known weak spot.
- Pending transactions are usually missing from downloaded files, or appear without a marker.
  This also varies by issuer and is **unverified**.
- Each issuer needs its own column mapping, and that mapping breaks silently when the issuer
  changes its layout.

### OFX / QFX

OFX is an open specification now maintained by the Financial Data Exchange (FDX). The current
banking version is 2.3 (October 2020). Source:
[OFX Banking Specification v2.3](https://financialdataexchange.org/wp-content/uploads/2025/12/OFX-Banking-Specification-v2.3.pdf),
[FDX OFX Work Group](https://financialdataexchange.org/about-fdx/ofx-work-group/). QFX is
Intuit's branded OFX for Quicken. It is the same structure plus Intuit-specific sign-on fields
such as `INTU.BID`. That last point is **unverified** against an Intuit primary source, but a
plain OFX parser that ignores unknown elements reads both. Banks still commonly serve OFX 1.x,
which is SGML (unclosed tags) rather than XML, so the parser has to handle both.

Each posted transaction is a `<STMTTRN>` (spec §11.4.4.1) with these elements:

- `TRNTYPE` (DEBIT, CREDIT, CHECK, and so on). The spec says it "does not change the effect of the
  transaction upon the balance"; only the sign of `TRNAMT` does.
- `DTPOSTED` (required), plus optional `DTUSER` (when the person made the transaction) and
  `DTAVAIL`.
- `TRNAMT`, "signed from the perspective of the customer. For example, a credit card payment is
  positive while a credit card purchase is negative." This is the same convention as an
  **Amount** in `CONTEXT.md`, so no sign flipping is needed.
- `FITID`, plus optional `CORRECTFITID` / `CORRECTACTION` (`REPLACE` or `DELETE`), `CHECKNUM`,
  `REFNUM`, `NAME` (A-32) or `PAYEE`, `EXTDNAME`, `MEMO`, and `SIC`.

On ids, spec §3.2.3: an FI assigns a `FITID` "to uniquely identify a financial transaction …
Its primary purpose is to allow a client to detect duplicate responses." "FITIDs must be unique
within the scope of an account but need not be sequential or even increasing … clients will
need to use FI + `<ACCTID>` + `<FITID>` as a globally unique key." Real banks follow this with
varying discipline. Some are known to change FITIDs between downloads (**unverified**,
practitioner reports), so a content-hash fallback is still worth having.

On pending, spec §11.4.1 and §11.4.4.2: OFX 2.2 added a parallel `<STMTTRNP>` aggregate for
pending transactions, downloaded as a "snapshot". "Unlike `<STMTTRN>`, `<STMTTRNP>` does not
contain the `<FITID>` tag … pending transactions should NEVER be stored or used for
reconciliation … When, and if, the transaction fully settles it will be available in a future
download in `<STMTTRN>`." In practice a downloaded OFX file holds posted transactions only.

## 2. Aggregator APIs

### SimpleFIN Bridge

- **What it is:** SimpleFIN is an open, read-only protocol, "like RSS for financial
  information" ([simplefin.org](https://www.simplefin.org/)). The Bridge is a hosted SimpleFIN
  server for banks that do not offer SimpleFIN themselves. Personal-finance tools such as Actual
  Budget use it ([ecosystem](https://www.simplefin.org/ecosystem.html)).
- **Cost:** "$1.50 + tax per month, or $15.00 + tax per year", covering "up to 25 institutions
  and 25 apps" ([Bridge](https://beta-bridge.simplefin.org/)).
- **Upstream:** the Bridge site does not name its data provider. Actual Budget's docs say the
  data depends on "the bank and upstream provider (MX)"
  ([Actual docs](https://actualbudget.org/docs/advanced/bank-sync/simplefin/)). That is
  second-hand.
- **Auth model** ([protocol v2](https://www.simplefin.org/protocol.html)): the user creates a
  Setup Token on the Bridge (a Base64-encoded claim URL). The app makes a one-time
  `POST` to that URL and receives an **Access URL** with HTTP Basic credentials embedded. After
  that, every request is `GET {AccessURL}/accounts`. No SDK, client certificate or webhook is
  involved. The protocol says the Access URL should be stored "at least as securely as" the
  financial data, so on Railway it belongs in an env var or an encrypted column. A 403 means
  access was revoked.
- **Endpoint:** `GET /accounts?start-date=&end-date=&pending=1&account=&balances-only=1`.
  Dates are Unix epoch seconds.
- **Transaction fields:** `id`, `posted` (Unix time; "may be `0`" when pending), `amount`
  (numeric string, positive = deposit), `description`, plus optional `transacted_at`, `pending`
  and `extra`. Account fields include `balance`, `available-balance` and `balance-date`, which
  are useful for recording actual balances.
- **Ids:** "An organization may reuse transaction ids for different accounts, but may never
  reuse a transaction id within an account." So the key is (account id, transaction id). The
  protocol does not say whether a pending transaction keeps its id when it posts.
- **Freshness and limits** ([developer guide](https://beta-bridge.simplefin.org/info/developers)):
  "intended to provide **daily updates**"; "up to 24 requests per day" (going over can disable
  the token); each request covers at most 90 days; history depth varies by institution.
- **Terms** ([terms](https://beta-bridge.simplefin.org/info/terms)): there is no
  personal-versus-commercial restriction, and liability is capped at what you paid. A household
  connecting its own accounts is the intended use.
- **Fit:** the cheapest and simplest live option. A nightly server cron job (well under the
  request quota) is enough. The catch is that the household depends on a small third party plus
  MX for credentials and freshness.

### Teller

- **Environments** ([environments](https://teller.io/docs/guides/environments)): sandbox
  (fake data), **development** (real bank logins, real data, free, **100 enrollments total**,
  counted as created rather than active), and production (paid, unlimited, requires Know Your
  Business verification). A household that links fewer than about 10 accounts and rarely
  re-enrolls fits in development indefinitely. That is an inference; the docs do not promise
  development stays free forever. Teller's public pricing page returned 404 during this
  research, so production pricing is **unverified**.
- **Auth** ([authentication](https://teller.io/docs/api/authentication)): "mTLS is
  **required** for all API requests that involve end-user data, i.e. all requests in
  `development` and `production`." "Access tokens are useless without a Teller client
  certificate." Tokens are sent as HTTP Basic (token as username, empty password). The Node
  server can present a client certificate and key loaded from Railway env vars.
- **Enrollment** ([Connect](https://teller.io/docs/guides/connect)): Teller Connect is a
  client-side JS widget loaded from Teller's CDN. It handles bank login and MFA and returns an
  `accessToken`. Enrollments are "designed to be long-lasting" but break on password changes or
  new MFA demands, and are repaired by reopening Connect.
- **Transactions** ([API](https://teller.io/docs/api/account/transactions)): `id`, `status`
  (`posted`/`pending`), `date`, `amount` (signed string), `description` (the raw bank text),
  `details.counterparty.name`, `details.category` and `running_balance` (posted only). Query by
  `count`, `from_id`, `start_date` and `end_date`. Teller usually keeps the same id when a pending
  transaction posts, but "if a pending transaction changes significantly on posting and can't be
  matched to the original, it's created as a new record with a new ID."
- **Fit:** free, live and fetched on demand, with ids that are usually stable from pending to
  posted. The costs are certificate handling, embedding a third-party widget in the PWA, and an
  enrollment budget that never refills.

### Plaid

- **Plans** ([pricing](https://plaid.com/pricing/), [billing](https://plaid.com/docs/account/billing/)):
  the free Trial allows **10 Production Items** (removing Items does not free slots) and is
  only for new US/CA teams created on or after 2026-04-15. Pay-as-you-go and Trial are both
  described as "most appropriate for hobbyist use". Transactions is billed as a **monthly
  subscription per Item** for as long as an `access_token` exists. Prices are shown in the
  Dashboard, not on the public page, so the exact amount is **unverified**. An Item is one login
  at one institution.
- **Gatekeeping** ([OAuth guide](https://plaid.com/docs/link/oauth/)): OAuth institutions need
  Dashboard compliance-centre registration, a filled-in application profile (some US banks
  refuse empty ones), and for certain banks a security questionnaire or the latest Master
  Services Agreement before Production access. Several of the largest US banks connect only over
  OAuth. A one-household "company" can fill these in, but approval is not guaranteed.
- **Transactions** ([Transactions API](https://plaid.com/docs/api/products/transactions/)):
  `/transactions/sync` is cursor-based and returns `added`, `modified` and `removed`. Up to 24
  months of history (`days_requested`, default 90, cannot be raised later without relinking).
  Plaid "typically checks for new transactions data between one and four times per day". You can
  force a check with `/transactions/refresh` (billed per request) and get notified via the
  `SYNC_UPDATES_AVAILABLE` webhook.
- **Pending to posted**
  ([transactions data](https://plaid.com/docs/transactions/transactions-data/)): the pending
  transaction's id arrives in `removed` and the posted one in `added` **with a new
  `transaction_id`**. The posted one carries `pending_transaction_id` when Plaid can match them.
  That link is null when the institution gives no pending data, and is missing when matching
  fails. Name and amount can change on posting (tips). Holds can vanish without posting. Posted
  transactions can still be `modified`.
- **Fit:** the most complete and best documented option, with webhooks and categories. It is
  also the heaviest: compliance paperwork, a hard cap of 10 Items on the free trial, then a fee
  per Item each month, and a Link widget plus webhook endpoint on Railway.

### Others considered

- **MX, Finicity (Mastercard), Akoya, Yodlee:** sold to businesses through sales contracts. No
  self-serve personal tier was found. Not credible for one household. **Unverified** beyond the
  absence of public self-serve plans.
- **GoCardless Bank Account Data** (formerly Nordigen, used by Actual Budget): EU/UK banks
  only, so it does not apply to US accounts.
- **Direct OFX Direct Connect** (the bank's OFX server, as Quicken and GnuCash use): many US
  banks have retired it or charge for it, and it varies bank by bank. **Unverified**; not worth
  designing around.
- **CFPB §1033 open-banking rule:** the 2024 rule would have required banks to give consumers
  and their authorised third parties free data access. It is enjoined and being reconsidered as
  of 2026, so nothing can rely on it yet. Secondary sources only:
  [Cooley](https://www.cooley.com/news/insight/2025/2025-08-27-cfpb-reconsiders-section-1033-rule-signaling-potential-overhaul-of-personal-financial-data-rights-framework),
  [PYMNTS](https://www.pymnts.com/dashboard-post/legal/cfpb/2026/cfpb-readies-changes-to-open-banking-rule/).

## 3. Implications for reconciling expected against actual

These hold whatever the source.

1. **Store an import key on every actual transaction**: `(account, source, external_id)`, with
   a unique index. `external_id` is the `FITID`, the SimpleFIN `id`, the Teller `id` or the Plaid
   `transaction_id`. For CSV, or a source with no id, it is a deterministic content hash
   (account + date + Amount + normalised description + occurrence index within that tuple).
   Re-importing overlapping date ranges then becomes an idempotent upsert. Every live source
   above returns overlapping windows, and file downloads always overlap, so this matters.
2. **Matching expected to actual is a separate step from de-duplication.** None of the sources
   know about the household's schedules. The match key is the account, the Amount (exact, or
   within a tolerance for variable bills such as utilities, or tips on pending card
   transactions), and the date within a window around the scheduled date (posting lags by a few
   days and weekends shift it). A payee or description pattern on the schedule breaks ties.
   Suggest a match automatically and let a person confirm; never silently force one.
3. **Pending.** Two models:
   - _Posted only_ (OFX's stance: "should NEVER be stored"): simplest and safest. Expected rows
     stay "expected" until the posted actual arrives. The forecast is slightly late but never
     wrong.
   - _Store pending, then replace it_: each provider behaves differently. Teller usually keeps
     the id. Plaid removes the pending row and adds a new id with a back-link. SimpleFIN does not
     say. Holds can vanish and amounts can change. This needs a `pending` flag, deleting pending
     rows that drop out of the feed, and re-pointing any expected-to-actual match from the
     pending row to its posted successor.
     For v1, a reasonable middle ground is to **show pending as a transient overlay (not stored
     as an actual) and reconcile only against posted**.
4. **Corrections and deletions** exist in every rich source (OFX `CORRECTACTION`, Plaid
   `modified`/`removed`, posted transactions that later change). Any match must survive its
   actual being replaced: re-match, or flag it for review.
5. **Dates:** use the posted date as the actual transaction's calendar date (`YYYY-MM-DD` in
   `America/New_York`) and keep the user or transaction date when given (`DTUSER`,
   `transacted_at`), because it is the better date for matching. SimpleFIN and Plaid
   timestamps are instants, so convert them through `src/shared/dates.ts`.
6. **Amounts:** OFX, SimpleFIN and Teller all use the customer's-perspective sign (money out is
   negative), matching **Amount**. Parse the decimal strings into integer cents through
   `src/shared/money.ts`; never via floats.
7. **The one-time Access import** (from the map) brings 2 to 3 years of history with no
   external ids. Those rows get content-hash keys, so the first live or file import that
   overlaps them must hash-match against them, or the overlap window will duplicate.

## 4. Recommendation for v1 (for the humans to decide)

> **Recommendation, not a decision.** The household should choose. The trade-off is cost and
> third-party trust against manual effort.

1. **Design the import pipeline around a source-agnostic "actual transaction" with
   `(account, source, external_id)` uniqueness, posted-only reconciliation, and a manual-confirm
   matcher.** Everything else plugs into that.
2. **Ship OFX/QFX file upload as the first source.** It is free, has no third party and no
   credentials on the server, has a real spec with per-account `FITID`s and the same sign
   convention as Amount, and uses one parser for every institution. A CSV mapping can be added
   per issuer only for an institution that does not offer OFX/QFX.
3. **Add SimpleFIN Bridge as the first live feed** (soon after the file import, or in v1 if
   manual downloads prove a chore). At $15/year it is a nightly Basic-auth GET with no SDK,
   certificate, widget or webhook, which suits a single Railway service. Fetch with
   `pending=1` only to show the transient overlay.
4. **Keep Teller in reserve** if SimpleFIN's daily freshness or institution coverage
   disappoints. It is free for a household's handful of enrollments, but adds mTLS and an
   embedded widget.
5. **Do not pick Plaid for v1.** Compliance paperwork, the 10-Item trial cap and fees per Item
   per month are built for companies, not one household.

## Sources

- OFX Banking Specification v2.3, FDX —
  https://financialdataexchange.org/wp-content/uploads/2025/12/OFX-Banking-Specification-v2.3.pdf
  (§3.2.3 FITID, §11.4.1 pending, §11.4.4.1 STMTTRN, §11.4.4.2 STMTTRNP)
- FDX OFX Work Group — https://financialdataexchange.org/about-fdx/ofx-work-group/
- SimpleFIN protocol v2 — https://www.simplefin.org/protocol.html
- SimpleFIN home and ecosystem — https://www.simplefin.org/ , https://www.simplefin.org/ecosystem.html
- SimpleFIN Bridge pricing, developer guide, terms — https://beta-bridge.simplefin.org/ ,
  https://beta-bridge.simplefin.org/info/developers , https://beta-bridge.simplefin.org/info/terms
- Actual Budget SimpleFIN docs (second-hand on MX and the 90-day limit) —
  https://actualbudget.org/docs/advanced/bank-sync/simplefin/
- Teller environments, authentication, Connect, transactions API —
  https://teller.io/docs/guides/environments , https://teller.io/docs/api/authentication ,
  https://teller.io/docs/guides/connect , https://teller.io/docs/api/account/transactions
- Plaid pricing, billing, Transactions API, transactions data, OAuth —
  https://plaid.com/pricing/ , https://plaid.com/docs/account/billing/ ,
  https://plaid.com/docs/api/products/transactions/ ,
  https://plaid.com/docs/transactions/transactions-data/ , https://plaid.com/docs/link/oauth/

# Finances App spec

Build agents use this spec to replace the Notes scaffold with the **Finances App**: recurring
Schedules, a daily cash-flow Forecast per Wallet, Reconciling Planned against Actual Transactions
(hand entry and OFX/QFX/QBO upload), Categories with a Monthly summary, and Balance checks. Three Shell
changes come first: Notes is removed, the Admin holds every App, and each App gets its own sidebar
with an App switcher. A one-time local import brings over the household's old data last.

`to-issues` slices this spec into tickets, following section 10.

Read first: `CONTEXT.md` (Shell glossary), `docs/finances/CONTEXT.md` (Finances glossary; there,
**Account** means a payee or income source, not a sign-in), `AGENTS.md`, then this file. Every
decision was settled with the user on the map
[Wayfinder: Finances App spec](https://github.com/thebigthing313/kabigting-apps/issues/15),
ending on 2026-10-16. Each row in section 2 links the ticket that holds its reasoning, but this spec
states each decision in full, so you don't need to read the tickets. If something cannot be done
as written, stop, record the deviation and ask the user. Do not silently re-decide.

**Public repo.** Never commit names, payees, amounts, account numbers, bank descriptions or any row
of the old database. Tests use made-up data. The Access file and its JSON extract stay in `exports/`
(gitignored).

## 1. Acceptance criteria

1. The Notes App is gone: no routes, tables, collections, tests or docs mention it. Its table is
   dropped by a migration, and its `app_access` rows are deleted.
2. An Account with the `admin` role can open every App, with no `app_access` rows. The Admin's
   Accounts screen no longer offers App checkboxes for an Admin.
3. Inside an App, the Shell sidebar lists that App's sections and has an App switcher at the top.
   At Home and on `/admin/*`, the sidebar lists the Apps (and the Admin group for the Admin). With
   no Apps, Home and the switcher show "No Apps yet".
4. Finances has Home, Schedules, Wallets and Summary sections, with the screens in section 7. Every
   screen works at phone width (360 px) with no horizontal page scroll.
5. A Wallet's Forecast is its daily end-of-day balance from the latest Balance check over a 30, 90,
   180 or 365-day horizon. It has threshold and below-zero warnings, and Overdue items count today.
6. Actuals can be entered by hand or uploaded from OFX/QFX/QBO files. Re-uploading the same file adds
   nothing. Suggested Reconciles appear in To review and are confirmed by a person.
7. The Monthly summary shows one month's income, spending and net, plus every Category, against
   last month and the trailing 12-month average.
8. `pnpm finances:import` loads the old data with a dry run, refuses when Finances holds data
   (unless run with `--wipe`), and prints a counts-only report that fails on any mismatch.
9. `pnpm check` and `pnpm test:all` pass on every slice. Every user-facing slice has a changeset.

## 2. Settled decisions

| # | Decision |
| --- | --- |
| D1 | The first slice replaces Notes with an empty, gated Finances App (key `finances`, title "Finances"). Tests that used Notes as their gated App move to `finances`. ([How is the Finances spec assembled and sliced?](https://github.com/thebigthing313/kabigting-apps/issues/32)) |
| D2 | App access means reading and writing all of an App's data. That data is shared by everyone holding the grant, so Finances rows have no owner column. (map Notes) |
| D3 | The Admin always holds every App, through the role and not through rows. These are Shell changes and belong in this spec. (#32) |
| D4 | Inside an App, the sidebar shows that App's sections, listed as data in its registry entry, under an App switcher dropdown. Section navigation lives only there; there is no bottom tab bar. (#32) |
| D5 | Glossary: Account, Wallet, Transaction (Planned or Actual), Schedule, Occurrence, Transfer, Category, Balance check, Reconcile, Overdue, Forecast, Monthly summary. ([Finances glossary: what are the core nouns?](https://github.com/thebigthing313/kabigting-apps/issues/16)) |
| D6 | A Schedule repeats every N weeks or N months (N ≥ 1) from its start date, which is the first Occurrence. A monthly Schedule on the 29th to 31st falls on the month's last day without losing its anchor day. Dates never shift for weekends or holidays. ([How does a Schedule make Planned Transactions?](https://github.com/thebigthing313/kabigting-apps/issues/19)) |
| D7 | Occurrences are computed by one pure shared function. They are stored only when overridden (amount or date), skipped or Reconciled, and keyed by (Schedule, nominal date). (#19) |
| D8 | Changing a Schedule from a date ends it the day before and starts a successor under the same Account. Later overrides move to the successor; any the new terms never fall on are deleted after a confirmation that lists them (decided on PR #69). Ending it deletes later overrides after a confirmation that lists them, and never touches Reconciled ones. Reopening clears the end date. Deleting is allowed only when nothing is Reconciled to it. (#19) |
| D9 | Actuals come from hand entry and OFX/QFX/QBO upload. Only posted lines are stored. Each one is keyed by (Wallet, source, source key); the source key is the FITID, or a content hash when there is none. ([How are Planned and Actual Transactions reconciled?](https://github.com/thebigthing313/kabigting-apps/issues/20), [Bank import options for a self-hosted household app](https://github.com/thebigthing313/kabigting-apps/issues/17)) |
| D10 | A Reconcile is one to one: suggested by the app, confirmed by a person. Candidates are in the same Wallet, have the same sign and are dated within ±7 days of the Planned date, ranked by closeness of amount, then of date. A person can also pick any outstanding Planned by hand. The Actual's amount and date are the truth. (#20) |
| D11 | A Planned item is outstanding (upcoming, or Overdue once its date passes), Reconciled or skipped. An Actual is Reconciled or unplanned, and unplanned is a normal end state. (#20) |
| D12 | An imported Actual has its amount, date and Wallet locked. Deleting one keeps its key, as an ignored line that can be restored. On a file's first upload, a person picks the Wallet for its bank account id. (#20) |
| D13 | Each Wallet has its own Forecast when it is "in the forecast". There is no combined total. The starting point is the latest Balance check, the posted end-of-day balance. Without a Balance check a Wallet has no Forecast; the forecast never assumes a zero opening balance. The low-balance threshold defaults to $0. ([How is the cash-flow forecast computed?](https://github.com/thebigthing313/kabigting-apps/issues/21)) |
| D14 | Categories are one flat list. A Transaction has at most one Category, and a Schedule's Category is its default. A Category has no direction. Categories are archived or merged, never deleted. ([How are categories structured and summarised monthly?](https://github.com/thebigthing313/kabigting-apps/issues/22)) |
| D15 | Wallets have no kinds. A card is a Wallet with a negative (owed) balance. A card payment is a Schedule Transfer whose Occurrence is overridden from each statement. There is no Statement record. "Shown as owed" flips the sign for entry and display only. ([How do credit card Wallets work?](https://github.com/thebigthing313/kabigting-apps/issues/27)) |
| D16 | OFX `TRNAMT` is signed from the customer's side: a card purchase is negative and a card payment positive. That matches signed cents, so no Wallet flips signs on upload. ([Bank import options for a self-hosted household app](https://github.com/thebigthing313/kabigting-apps/issues/17), checked in #32) |
| D17 | Home layout: tabs for All, then one per forecast Wallet. The Wallet view has a chart and a day-by-day list from today. The All view shows Wallet cards. A notifications bell sits in the Finances page header, and one + button offers Add Actual, Upload file and Enter Balance check. ([What does the Finances home screen show?](https://github.com/thebigthing313/kabigting-apps/issues/23)) |
| D18 | The household's "open on home" choice (a forecast Wallet, or All) is set from home's tab row. It is not set in Wallet Settings. (#32) |
| D19 | The Schedules and Wallets screens follow prototype variant A, "Lists and tabs". ([What do the Schedule and Wallet screens show?](https://github.com/thebigthing313/kabigting-apps/issues/29)) |
| D20 | The Monthly summary combines A's totals table with B's Category bars and B's Category page. A "Manage Categories" link sits at the foot of the summary. ([What does the Monthly summary screen look like?](https://github.com/thebigthing313/kabigting-apps/issues/30), #32) |
| D21 | Attention items link to where they are fixed. The mapping is in section 7.8. (#32) |
| D22 | Loading: the small collections load eagerly, including `occurrences`. Transactions, Transfers and Balance checks load on demand through each screen's live query. One-off Planned and Actual Transactions share one collection, with a `status` field. ([What data does the client load, and where is the forecast computed?](https://github.com/thebigthing313/kabigting-apps/issues/31)) |
| D23 | The client computes the Forecast, the Monthly summary and Reconcile suggestions with pure `src/shared` functions. The server parses uploads and de-duplicates them. (#31) |
| D24 | Debts get no special treatment. Loan and mortgage payments are ordinary spending under Loans and mortgage. ([Does v1 track debts, and how?](https://github.com/thebigthing313/kabigting-apps/issues/28)) |
| D25 | The import brings all history since 2019, through a local extract and `pnpm finances:import`. The full mapping is in section 8. ([What does the one-time import bring over, and how does it map?](https://github.com/thebigthing313/kabigting-apps/issues/24)) |
| D26 | The prototype branches `prototype/finances-home` and `prototype/finances-screens` are visual references only and are never merged. Match the picked variants, but don't copy their stub code. (#32) |
| D27 | Uploads accept `.ofx`, `.qfx` and `.qbo`. All three are OFX with different headers, so one parser reads them. Bank of America and American Express cards offer QBO but not QFX. CSV-only issuers are hand entry in v1. Discover cards are moving to Capital One's site, where file downloads exist. (checked after #32) |

## 3. Shell changes

### 3.1 Replace Notes with an empty Finances App (slice 1)

- `src/shared/apps.ts`: `APPS = [{ key: "finances", title: "Finances" }]`.
- Delete everything Notes:
  - Client: `src/client/apps/skeleton/` and its tests, `src/client/data/skeleton-notes.ts`, and
    `src/client/routes/_app/skeleton.tsx`. Then regenerate `routeTree.gen.ts`.
  - Shared: `src/shared/schemas/skeleton.ts` and its test.
  - Server: `src/server/apps/skeleton/` and the `/skeleton` mount in `src/server/app.ts`.
  - Database: `src/server/db/schema/skeleton.ts` and its re-export.
  - End-to-end: `e2e/notes.spec.ts`.
- Migration `0002`: drop `skeleton_notes`, and `DELETE FROM app_access WHERE app_key = 'skeleton'`.
- Add `src/server/apps/finances/routes.ts`, built with `createAppRouter("finances", deps)` and
  mounted at `/api/finances`. It has no resources yet.
- Add `src/client/routes/_app/finances/route.tsx`. Its `beforeLoad` throws `notFound()` without
  access, as Notes did. Add `index.tsx`, an empty Finances home that says "Nothing here yet".
- Retarget every test and the seed from `skeleton` to `finances`:
  - `src/server/core/guards.int.test.ts`
  - `src/server/core/admin-routes.int.test.ts`
  - `src/server/auth/accounts.int.test.ts`
  - `src/server/db/migrate.int.test.ts`
  - `src/server/static.int.test.ts`
  - `e2e/auth.spec.ts`
  - `e2e/admin.spec.ts`
  - `scripts/e2e-setup.ts`

  Where a test needs a gated request, use `POST /api/finances/wallets/query`. Until slice 4 adds
  it, use a `GET /api/finances/ping` route that returns `{ ok: true }`, and delete that route in
  slice 4.
- Docs: change the usage comment in `scripts/admin.ts`, `CONTEXT.md` ("Walking skeleton"),
  `docs/restore.md` ("open Notes" becomes "open Finances") and `docs/versions.md` (the NotesPage
  compile check moves to a Finances component).
- Change the comment example in `src/client/data/collection-factory.ts` to `"finances-wallets"`.

### 3.2 The Admin holds every App (slice 2)

- `requireApp`: when `c.get("account").role === "admin"`, call `next()` without querying rows.
- `GET /api/access`: return `APP_KEYS` for an Admin, and the Account's rows for anyone else.
- `src/server/auth/accounts.ts`: `grantApps` and set-apps reject an Admin target with
  `validation_failed` ("The Admin holds every App"). `scripts/admin.ts create` stops granting
  rows to the Admin it creates.
- The Accounts screen: an Admin's row shows an "All Apps" chip, and the edit sheet hides the App
  checkboxes for an Admin.
- Migration `0003`: delete `app_access` rows whose user has the `admin` role.
- Tests:
  - An Admin with zero rows passes `requireApp` and gets every key from `/api/access`.
  - A non-Admin is unchanged.
  - Setting Apps on an Admin is refused.

### 3.3 App sidebar and App switcher (slice 3)

- `src/client/shell/apps.ts`:
  - `AppEntry.to` becomes the App's home route type (`"/finances"`).
  - Each entry gains `sidebar: readonly { title: string; to: <route>; icon: LucideIcon }[]`.
  - Finances lists Home `/finances` (`HouseIcon`), Schedules `/finances/schedules`
    (`RepeatIcon`), Wallets `/finances/wallets` (`WalletIcon`) and Summary `/finances/summary`
    (`ChartColumnIcon`). Exact icon names may differ in the pinned `lucide-react`; pick the
    nearest one.
- `src/client/shell/app-shell.tsx` works out the **context** from the current route: the App whose
  `to` prefixes the pathname, or the Shell (Home and `/admin/*`).
  - **Shell context:** the header shows "Kabigting Apps" with no dropdown. The body shows Home,
    then the Apps the Account may open, then the Admin group (Accounts) for the Admin.
  - **App context:**
    - The header is the **App switcher**, a dropdown showing the current App's icon and title.
      Its menu lists Home, then every App the Account may open, and picking one goes to that
      App's `to`.
    - The body lists the App's `sidebar` items, active when the pathname matches. An item whose
      route has child pages (Schedules, Wallets) stays active on those pages.
    - There is no Admin group.
  - The footer Account menu is unchanged in both contexts. The `collapsible="icon"` and mobile
    drawer behaviour is unchanged. On a phone, choosing a sidebar item closes the drawer.
- With no Apps, Home's launcher and the switcher menu show "No Apps yet".
- Tests:
  - A component test covers the active state and both contexts.
  - An e2e test moves from Home into Finances via the sidebar, switches section, then returns
    Home via the switcher.

## 4. Data

All Finances tables live in `src/server/db/schema/finances.ts`, re-exported from the schema
index. Each slice adds the tables it needs in its own migration.

Conventions that apply to every table:

- `id` is a client-supplied UUIDv7, with a `uuidv7()` default as a fallback, as Notes did.
- Every table has `createdAt` and `updatedAt` (timestamptz).
- Amounts are `bigint` cents, signed: money out is negative.
- Dates are `date` columns in `mode: "string"`.
- No table has an owner column (D2).

Each table's columns:

- **`finances_accounts`**: `name` (unique), `note`, `archived` (boolean, default false).
- **`finances_wallets`**:
  - `name` (unique)
  - `inForecast` (default false)
  - `lowBalanceThresholdCents` (default 0)
  - `shownAsOwed` (default false)
  - `bankAccountHash` (nullable, unique): SHA-256 of the OFX BANKID/ACCTID pair
  - `bankAccountLast4` (nullable)
  - `archived` (default false)

  Never store a full account number.
- **`finances_categories`**: `name` (unique), `archived`, `mergedIntoId` (nullable FK to itself).
- **`finances_schedules`**:
  - `accountId` (nullable FK)
  - `walletId` (FK): the Wallet it draws on, or the Transfer's from Wallet
  - `toWalletId` (nullable FK): set only for a Transfer Schedule
  - `amountCents`: signed for Transactions; positive for Transfers, as money moved from `walletId`
    to `toWalletId`
  - `unit` (`'week'` or `'month'`)
  - `every` (int ≥ 1)
  - `startDate`
  - `endDate` (nullable, inclusive)
  - `categoryId` (nullable FK, null when `toWalletId` is set)
  - `note`
  - `predecessorId` (nullable FK to itself)

  Check constraints: `every >= 1`; `toWalletId <> walletId`; `endDate >= startDate`.
- **`finances_occurrences`**:
  - `scheduleId` (FK)
  - `nominalDate`, unique with `scheduleId`
  - `overrideAmountCents` (nullable)
  - `overrideDate` (nullable)
  - `skipped` (default false)
  - `reconciledTransactionId` (nullable, unique FK)
  - `reconciledTransferId` (nullable, unique FK)

  At most one of the two reconciled links is set. The card-payment labels **Statement balance**
  and **Due date** are the override amount and date relabelled on screen; there are no extra
  columns (D15).
- **`finances_transactions`**:
  - `status` (`'planned'` or `'actual'`)
  - `walletId` (FK)
  - `date`
  - `amountCents`
  - `accountId` (nullable FK)
  - `categoryId` (nullable FK)
  - `note`
  - `bankDescription` (nullable)
  - `source` (nullable: `'manual'`, `'ofx'` or `'access'`)
  - `sourceKey` (nullable)
  - `ignored` (default false): an imported Actual a person deleted
  - `reviewedAt` (nullable): when a person resolved its To review entry
  - `reconciledActualId` (nullable, unique FK to itself): set on a one-off Planned once Reconciled

  Unique index on (`walletId`, `source`, `sourceKey`) where `sourceKey` is not null. Planned rows
  have a null `source`. An Actual is **Reconciled** when an Occurrence or a Planned row points to
  it.
- **`finances_transfers`**:
  - `status`
  - `date`
  - `amountCents` (positive)
  - `fromWalletId` and `toWalletId` (FKs)
  - `accountId` (nullable)
  - `note`
  - `fromSource`, `fromSourceKey`, `fromBankDescription`
  - `toSource`, `toSourceKey`, `toBankDescription`
  - `ignored`
  - `reconciledActualId` (nullable, for a one-off Planned Transfer)

  Unique indexes on (`fromWalletId`, `fromSource`, `fromSourceKey`) and (`toWalletId`, `toSource`,
  `toSourceKey`) where the key is not null. "Only one side arrived" means an Actual Transfer with
  exactly one side's key set.
- **`finances_balance_checks`**: `walletId`, `date`, `amountCents`, unique on (`walletId`,
  `date`). Entering a second check for the same date replaces the first (an upsert).
- **`finances_settings`**: one row with id `'household'`, holding `openOnHomeWalletId` (nullable;
  null means All). The migration seeds it.

**Transfers on upload.** An upload must not re-add a line that has become one side of a Transfer.
De-duplication therefore checks a line's key against both tables, ignored rows included.

**Deleting.** Accounts, Wallets and Categories with history are archived, not deleted. An
Account or Wallet that nothing references may be deleted.

## 5. Shared functions (`src/shared/finances/`)

These are pure functions, tested with unit tests on made-up data. Dates go through
`src/shared/dates.ts` (extend it with `addDays`, `addMonthsClamped`, `daysBetween`,
`lastDayOfMonth` and similar as needed). Money goes through `src/shared/money.ts`.

- **`occurrences.ts`**:
  - `expandSchedule(schedule, stored, range)` returns each Occurrence in `[from, to]` with its
    nominal date, its effective date and amount (the override, else the Schedule's) and its
    state:
    - `upcoming`
    - `overdue` (effective date before today, nothing Reconciled). The Forecast counts an
      Overdue Occurrence only when its effective date is after the Wallet's latest Balance check
      (see `forecast.ts` below).
    - `skipped`
    - `reconciled`
  - A stored override whose effective date falls in range is included even when its nominal date
    falls outside the range.
  - Monthly anchoring follows D6. An annual Schedule (every 12 months) on Feb 29 falls on Feb 28
    in other years.
  - `scheduleChain(schedules, id)` returns the predecessor chain, newest first, for the History
    list.
  - `describeTerms(schedule)` returns the terms in words, such as "Monthly on the 1st" or "Every 2
    weeks on Friday".
- **`forecast.ts`**: `forecast({ wallet, latestCheck, actualsSince, planned, plannedTransfers,
  schedules, occurrences, today, horizonDays })`.
  - It returns one entry per day from today to today + horizon − 1, each with its end-of-day
    balance and its items. It also returns today's balance, the low point (amount and date), the
    first day under the threshold and the first day under $0.
  - Today's balance is the check plus the Actuals dated after the check's date.
  - Outstanding Planned Transactions and Transfers (Occurrences and one-offs) land on their
    effective date. Overdue ones land on today.
  - An Overdue Occurrence counts only when its effective date is after the latest Balance check's
    date. One dated on or before the check is taken as already in the bank's balance and is left
    out (decided on PR #67, refining #21's "whatever their date"). Overdue one-off Planned
    Transactions and Transfers follow the same rule (decided for #47).
  - A Transfer is an outflow from `fromWallet` and an inflow to `toWallet`.
  - It returns `null` when the Wallet has no Balance check.
- **`reconcile.ts`**:
  - `suggestMatches(actual, outstanding)` returns ranked candidates under D10.
  - `findHandEntryTwin(line, handEntered)` checks for the same Wallet, the exact amount, within ±3
    days, and no key on the hand-entered Actual.
  - `suggestTransferHalf(line, transfers)` looks for an Actual Transfer on the other Wallet with
    one side missing, the same absolute amount, and a date within ±7 days.
- **`summary.ts`**: `monthlySummary(actuals, categories, month)` covers the month M and the 12
  months before it.
  - Per Category plus Uncategorised, it gives the month's net, last month's net and the 12-month
    average. The average divides by the number of months in the window on or after the first
    month that has any Actual, with a minimum of 1.
  - It gives the totals for income, spending and net, where income is the sum of Categories that
    net positive that month and spending the rest.
  - Merged Categories count under their target. Archived Categories with Actuals in the window
    appear, marked archived.
  - `categoryYear(actuals, categoryId, month)` returns the 12 monthly bars ending at M, plus the
    average.
- **`schemas.ts`**: Zod row and write schemas for every resource, built with
  `src/shared/schemas/query.ts` (`queryBody`, `rowsResponse`).

## 6. Server (`src/server/apps/finances/`)

There is one router, `createAppRouter("finances", deps)`. Every row is shared household data,
so there is no owner filter.

**Resources.** `accounts`, `wallets`, `categories`, `schedules`, `occurrences`,
`transactions`, `transfers`, `balance-checks` and `settings` each have:

- `POST /<r>/query`
- `POST /<r>`, which uses the client's id; an existing id is a conflict
- `PATCH /<r>/:id`
- `DELETE /<r>/:id`

`settings` has only query and PATCH. Every write returns the stored row.

**On-demand query filters.** `transactions`, `transfers` and `balance-checks` accept exactly
these filters, and reject anything else as `validation_failed`:

- `walletId`
- `dateFrom` and `dateTo`
- `categoryId`, where `null` means Uncategorised
- `status`
- `unreviewed`
- `includeIgnored`
- `ids`
- `order` (`dateAsc` or `dateDesc`)
- `limit` and `after`

**Rule enforcement.** The server enforces:

- Imported Actuals lock their amount, date and Wallet (D12). A PATCH changing them is refused.
- A Schedule with a `toWalletId` has no Category.
- One link per Occurrence, and one Reconcile per Actual.
- `DELETE` on an imported Actual sets `ignored` and keeps the row.
- `DELETE` on a Schedule is refused when anything is Reconciled to it.

**Commands.** Each command runs in one database transaction and returns every row it changed,
grouped by collection:

- `POST /reconcile` with `{ plannedKind: "occurrence" | "transaction" | "transfer", plannedRef,
  actualId }`:
  - It upserts the Occurrence's link, or sets the Planned row's `reconciledActualId`.
  - It sets the Actual's `reviewedAt`.
  - If the Actual has no Category, it takes the Planned item's Category.
  - Reconciling a Transaction line to a Planned Transfer converts it into an Actual Transfer: the
    line's key moves to the matching side, and the Transaction row is deleted.
- `POST /unreconcile` with `{ actualId }`: the link is removed, and the Planned item goes back to
  outstanding at its previous amount.
- `POST /transactions/mark-reviewed` with `{ ids }` (1 to 5000): sets `reviewedAt` on each Actual
  that has none yet and returns the rows it changed. Rows already reviewed keep their time. The
  client uses it right after an upload for lines with nothing to suggest (7.2), and for Unplanned
  in To review (7.4). (Added for #51.)
- `POST /transactions/:id/same-as-hand-entry` with `{ handEntryId }`: confirms that the uploaded
  line `:id` repeats a hand-entered Actual. (Added for #51.)
  - It checks the twin rule again with `findHandEntryTwin`: the hand entry must be a hand-entered
    Actual that isn't ignored, in the same Wallet, for the exact amount, within ±3 days of the
    line. The line must be an imported Actual that isn't ignored. Otherwise it refuses with
    `validation_failed`.
  - If the hand entry is Reconciled, its Reconcile (an Occurrence's link or a one-off Planned's
    `reconciledActualId`) moves to the uploaded line. If both are Reconciled, it refuses with 409.
  - The line keeps the bank's amount and date and takes the hand entry's Account, Category and
    note, falling back to its own where the hand entry has none. It sets `reviewedAt`.
  - The hand entry is deleted. The result has the same shape as `/reconcile`'s.
- `POST /transactions/:id/mark-transfer` with `{ otherWalletId }`: converts the Actual into an
  Actual Transfer with one side keyed.
- `POST /transfers/:id/pair` with `{ actualId }`: moves that Actual's key onto the Transfer's
  missing side and deletes the Actual.
- `POST /schedules/:id/change-from` with `{ date, changes, confirmDeleteOverrides: string[] }`:
  ends the Schedule on `date − 1` and creates the successor with `predecessorId`. Stored
  Occurrences dated on or after `date` (by nominal date) that aren't Reconciled move to the
  successor, except those the successor's terms never fall on (a new day or frequency, or a first
  date after `date`). Those are deleted, and the request is refused (409) unless the list equals
  them. Reconciled ones are never touched.
- `POST /schedules/:id/end` with `{ endDate, confirmDeleteOverrides: string[] }`: refused unless
  the list equals the later non-Reconciled stored Occurrences. Those are deleted.
- `POST /categories/:id/merge` with `{ intoId }`: moves Transactions and Schedule defaults over,
  then archives the Category and sets `mergedIntoId`.
- `POST /uploads`, a multipart OFX/QFX/QBO file under a 5 MB upload limit (a separate `bodyLimit` for
  this route):
  - It parses with `ofx.ts`.
  - If the bank account hash is unknown, it returns `{ needsWallet: { last4 } }`. The client
    resends with `walletId`, and the Wallet remembers the hash.
  - It inserts the new posted lines as Actuals (`source: 'ofx'`), drops lines whose key is
    already stored, and returns `{ inserted, duplicates }`.
- **`ofx.ts`** is a small hand-written parser for OFX 1.x (SGML) and 2.x (XML). It reads `.ofx`,
  `.qfx` (Quicken) and `.qbo` (QuickBooks Web Connect) alike, ignoring unknown elements such as
  Intuit's `INTU.*` headers (D27). The source is `'ofx'` for all three.
  - Fields read:
    - `BANKID`/`ACCTID` from `BANKACCTFROM` or `CCACCTFROM`
    - for each `STMTTRN`: `TRNAMT`, `DTPOSTED`, `FITID`, `NAME`, `MEMO`
  - `DTPOSTED` becomes a date by its first 8 digits, the bank's own calendar date. There is no
    zone conversion.
  - `TRNAMT` parses to cents through `money.ts` with no sign flip (D16).
  - With no `FITID`, the source key is the SHA-256 of date, amount, description and the line's
    ordinal among identical lines in the file.
  - Pending lines aren't in OFX statements. Nothing else is filtered.
  - Tested on made-up sample files in both dialects, a QFX and a QBO file with Intuit headers,
    and a card statement.

## 7. Client

**Data.** Collections live in `src/client/data/finances-*.ts`.

- **Eager:** `finances-accounts`, `-wallets`, `-categories`, `-schedules`, `-occurrences` and
  `-settings`. They use the existing factory with the 30-second stale time.
- **On-demand:** `finances-transactions`, `-transfers` and `-balance-checks`. These need a new
  on-demand factory beside the eager one: TanStack DB `syncMode: "on-demand"`, with the live
  query's `where`/`orderBy`/`limit` translated into the server filters above.
  - Transactions and transfers use a 5-minute stale time and refetch after an upload or a
    command.
- Commands write the returned rows into each collection with `writeUpsert` or `writeDelete`.
- The design is online-first: refetch on focus and reconnect, the last write wins, and there is
  no offline mode.

**Routes.** Under `src/client/routes/_app/finances/`:

- `index`: Home
- `schedules/index` and `schedules/$scheduleId`
- `wallets/index` and `wallets/$walletId`, with `?tab=activity|checks|settings`
- `summary`, with `?month=YYYY-MM`
- `categories/index` and `categories/$categoryId`, with `?month=`

Detail pages carry a back link to their list. Amounts use `money.format`, flipped for shown-as-owed
Wallets.

**Page header.** Every Finances page header has the page title and the notifications bell (7.8).
Home and Wallet pages also have the floating + button.

### 7.1 Home (`prototype/finances-home`, variant B for the Wallet view, C for All)

- **Tab row:** All, then one tab per forecast Wallet. A forecast Wallet with no Balance check
  shows as a dashed "Enter balance" tab that opens the Balance check dialog. The tabs scroll
  sideways on a phone.
- **Open-here action:** the selected tab's overflow menu has "Open here by default", which writes
  `finances-settings`. The current default shows a small pin. Home opens on the default.
- **Wallet view:**
  - Today's balance, and the low point with its date.
  - The horizon picker (30/90/180/365, default 90, kept in `?days=`).
  - A balance chart with threshold and $0 lines and the low point marked, using the repo's
    charting choice.
  - A warning line for the first day under the threshold and the first day under $0.
  - A day-by-day list from today: each day's end-of-day balance with its items under it. Overdue
    items sit under today, marked Overdue.
  - A banner with this Wallet's To review and Overdue counts, linking per 7.8.
- **All view:** one card per Wallet.
  - A forecast Wallet's card shows its balance, low point, warning, next three items, and To
    review and Overdue counts. Tapping it selects that Wallet's tab.
  - A Wallet not in the forecast shows a greyed card reading "Not in the forecast", with its
    latest Balance check, if any.
- **+ button:** Add Actual, Upload file, Enter Balance check. Each starts on the selected Wallet,
  or asks for a Wallet when the All view is selected.

### 7.2 Add Actual, one-off Planned, Upload, Balance check (dialogs)

- **Add:**
  - The form has Planned or Actual, Wallet, date (default today), Amount (with an in/out toggle,
    flipped for shown-as-owed), Account, Category and note.
  - For an Actual, the form lists `suggestMatches` candidates under the fields, and a person may
    tick one to Reconcile on save. Hand-entered Actuals never go to To review.
  - It can also enter a one-off Planned Transfer, or an Actual Transfer, by choosing "Transfer
    to…".
- **Upload:**
  - It shows a file picker accepting `.ofx`, `.qfx` and `.qbo`. If the server returns `needsWallet`, it shows a Wallet picker with
    the last four digits, then the result: "N added, M already here".
  - New lines that have a suggestion, a hand-entry twin or a Transfer half land in To review.
    Lines with none are unplanned, with `reviewedAt` set by the client right after the upload.
- **Balance check:**
  - The form has Wallet, date (default today) and Amount (as the bank shows it).
  - On save it shows the computed balance (the previous check plus the Actuals between) and the
    difference. Nothing is adjusted automatically.

### 7.3 Schedules (variant A)

- **List:**
  - Schedules are grouped by the Wallet they draw on.
  - Each row shows the Account (or "Transfer to <Wallet>"), `describeTerms`, and the next
    Occurrence's date and amount.
  - Ended Schedules sit in a dimmed "Ended" group. A chain of successors shows as one row under
    its newest Schedule.
  - A New button opens the create form: Wallet, Transaction or Transfer to Wallet, Account,
    Amount, every N weeks/months, start date, optional end date, Category and note.
- **Schedule page:**
  - **Header:** the name, Wallet (→ the other Wallet for a Transfer), Category, and the actions
    **Change from a date…**, and **End…** or **Reopen**.
  - **Occurrences:** the last 3 months and the next 6 months, each with its date, amount and
    state badge (none shown for an untouched one). Tapping one opens an inline editor: amount and
    date, Save, Skip or Unskip, and "Back to schedule" (deletes the override).
    - A Reconciled Occurrence isn't editable; it links to its Actual's Wallet Activity.
    - On a Transfer Schedule into a Wallet with `shownAsOwed`, the editor's fields read
      **Statement balance** and **Due date**.
  - **History:** `scheduleChain`, newest first, each entry with its date range, terms and
    amount.
  - **End…** opens a confirm listing the overrides that will be deleted.
  - **Change from a date…** lists, as the terms are edited, the later overrides the new terms
    never fall on; saving deletes them.
- Delete is offered only when nothing is Reconciled to the chain.

### 7.4 Wallets (variant A)

- **List:** each Wallet with its balance (the latest check plus the Actuals since; "No Balance
  check" when there is none), its last check date, and "not in the forecast" when off. Archived
  Wallets are hidden behind a "Show archived" toggle. A New button adds a Wallet.
- **Wallet page:** the balance in large type ("owed" when shown as owed), then three tabs:
  - **Activity:**
    - The **To review** panel on top: for each unreviewed imported Actual with a suggestion, the
      line, its best candidate, and **Confirm**, **Pick another** (all outstanding Planned in
      this Wallet) and **Unplanned**. Hand-entry twins read "Same as your hand entry?"; confirming
      deletes the hand entry and keeps the imported row with the hand entry's Account, Category
      and note. Transfer halves read "Other side of <Transfer>?".
    - **Upcoming one-offs:** this Wallet's outstanding one-off Planned Transactions and
      Transfers, each editable or deletable.
    - Then past Actuals and Transfers, newest first, a page at a time. Each row shows the date,
      label (Account, else the bank description, else the note), the Category or Uncategorised,
      what it's Reconciled to, and the amount.
    - A Transfer row shows "to/from <Wallet>" and is flagged when only one side has arrived.
    - Tapping a row opens its editor: the Category, Account and note, plus amount, date and
      Wallet on hand-entered rows. The editor also has Mark as Transfer, Un-Reconcile and
      Delete.
    - An "Ignored lines" link lists ignored rows, each with Restore.
  - **Balance checks:** an Enter Balance check button, then the list by date, each with "off by
    <Amount>" when it differs from the computed balance.
  - **Settings:** name, in the forecast, low-balance threshold, shown as owed, the remembered bank
    account (last four digits, with Forget), and Archive. There is no open-on-home toggle (D18).

### 7.5 Monthly summary (variant A table above variant B bars)

- **Month:** ‹ › arrows around the month title. It opens on last month. The arrows stop at the
  first month with Actuals and at this month, which reads "so far".
- **Totals table:** Income, Spending and Net as rows; columns for the month, Last month and 12-mo
  avg.
- **Income Categories:** a short list, each with its amount and its difference from the average.
- **Spending Categories:** each has a bar for the month, a tick at the 12-month average, and the
  line "Last month <Amount> · avg <Amount>". A bar more than 25% over its average (and at least
  $25 over) is highlighted. Uncategorised comes last, and archived Categories are marked.
- **Manage Categories:** a link at the foot opens the Categories list.

### 7.6 Category page and Categories list

- **Category page:** a back link to the month, a year of bars against a dashed average line, the
  month's figures, and that month's Actuals (date, label, Wallet, amount, each opening the Wallet
  Activity editor). Its actions are **Rename**, **Merge into…** (a confirm naming the counts
  moved) and **Archive** or **Unarchive**. Uncategorised has the page but no actions.
- **Categories list:** every Category, with archived ones marked, plus **Add** and **Unarchive**.

### 7.7 Accounts

There is no Accounts screen. Accounts are created inline from the Account picker ("Add
'<typed name>'") and renamed in a small dialog opened from the picker.

### 7.8 Attention: the banner and the bell

- The bell's count is the number of items listed, grouped by Wallet. It covers lines to review,
  Overdue items, forecast Wallets with no Balance check, and low-balance warnings within the
  current horizon.
- Each item opens:
  - **To review** → that Wallet's Activity tab
  - **Overdue Occurrence** → its Schedule page with that Occurrence's editor open
  - **Overdue one-off** → the Wallet's Activity tab at Upcoming one-offs
  - **No Balance check** → the Balance check dialog for that Wallet
  - **Low balance** → that Wallet's home tab, scrolled to the day

## 8. One-time import

This section holds the full mapping, from
[What does the one-time import bring over, and how does it map?](https://github.com/thebigthing313/kabigting-apps/issues/24).
Only counts are ever printed or committed.

**Extract.** `scripts/finances-extract.ps1` reads the Access file read-only and writes every
table as JSON to `exports/finances-extract/`.

- It takes the file path as an argument. Never hard-code a local path.
- It names no data, only the table names it finds.

**Load.** Run `pnpm finances:import [--dry-run] [--wipe] <extract dir>`.

- It writes to `DATABASE_URL`, like `pnpm admin:*`.
- It refuses when any Finances table has rows, unless `--wipe` is given, which clears Finances
  first.
- The mapping is pure functions in `scripts/finances-import/`, unit-tested on made-up extracts,
  and the write runs in one database transaction.

**Order.** Run on a local database first, then on production after a manual Railway backup
(section 11).

**Report.** Counts only:

- Rows read and written, per table and per year.
- Old and new monthly totals per Category, side by side, computed with
  `src/shared/finances/summary.ts`.
- How many card rows each branch of the card rule caught, per year.
- Every skipped row, as a reason and a count.

Any mismatch exits non-zero. There is no balance-equality check.

**Left behind:**

- generated future rows
- amortization rows
- caches, the change log and the import-error table
- investments
- the two-person shares
- inactive Schedules (their names still become Accounts where history uses them)
- account numbers and URLs

**Wallets.** Checking (in the forecast) plus one card Wallet per card (not in the forecast, shown
as owed).

**Card rows.** Rows under card Schedules are classified one at a time:

- A payment word in the bank description (`ONLINE`, `PAYMENT`, `AUTOPAY`, `TRANSFER` and so on)
  makes the row an Actual Transfer from Checking to the card, with no Category.
- Any other description makes it a charge: an Actual on the card.
- With no description, the row is a payment when it is the only row in its schedule-month, or
  when it is within max($1, 10%) of the minimum payment. Otherwise it is a charge.

Ledger-only rows that look like card-statement lines go to the card whose lines share an issuer
word, worked out at run time and never hard-coded. When that is unclear, they go to Checking and
are listed in the report.

**Actuals.**

- A linked ledger row and its old transaction become one Actual:
  - its date and signed amount from the old transaction (an expense is negative, income positive,
    and a negative expense becomes money in)
  - its Category from the ledger row
  - its note from the old note
  - its `bankDescription` from the old raw description
  - `source: 'access'`, with the old id as `sourceKey`
- Unlinked rows on either side each become an Actual.
- An old transaction linked from several ledger rows becomes one Actual per ledger row.
- Stale pending rows come in as ordinary Actuals. Zero-amount rows and the row dated year 425
  drop.
- Every imported Actual is unplanned, with `reviewedAt` set.

**Accounts.** One per Schedule name used in history, plus any payee name on 5 or more rows. Other
rows get no Account, and their payee text goes into the note.

**Schedules.** The 35 active ones (an old row in the last 12 months, or a generated future row)
come over:

- monthly becomes every 1 month, annually every 12 months, bi-weekly every 2 weeks
- the amount is the minimum payment for expenses, the income amount for income
- the start date is the old next generated date
- notes carry over
- card Schedules become Transfer Schedules from Checking to the card
- the one active "once only" Schedule becomes a one-off Planned, if its date is still ahead

**Categories.** The 17 below. The import ticket's text says 16, but its table lists 17, and the
table is what was agreed. Loan payments are spending under Loans and mortgage. Old
"Credit Cards" rows become Transfers. Rows with no category, and Savings, are Uncategorised.

| New Category | Old ones merged in |
| --- | --- |
| Dining Out | Dining Out, Alcohol and Bars, Coffee Shops |
| Groceries | Groceries |
| Utilities | Utilities |
| Subscriptions | Subscriptions, Music, Gaming |
| Housing | Home Services, Rent, Moving Expenses |
| Loans and mortgage | Mortgage, Student Loan, Loans, Car Payments |
| Insurance | Insurance |
| Medical | Medical, Veterinarian |
| Car | Gas, Tolls, Parking, Auto Maintenance, Cabs |
| Shopping | Shopping, Refunds, Technology, Printing, Personal Care |
| Fun and travel | Fun Activities, Gambling, Travel, Hotels |
| Gifts and charity | Gifts, Charity, Wedding |
| Fees | Bank Fees, State Fees, Postage |
| Cash | Withdrawal |
| Paycheck | Paycheck |
| Reimbursements | Reimbursements, Deposits, Freelance, Sales, Selling Stuff, Crossword Income |
| Tax refund | Tax Refund |

An old category not in this table fails the dry run, and the table is then amended with the
user.

**Balance checks.** For each day, the last hand-typed balance becomes that day's Balance check on
Checking, dated in the household zone.

## 9. Tests

- **Unit:** every function in `src/shared/finances/`, with edge cases:
  - Schedules: the 31st through February and leap years, a 2-week cadence across DST, overrides
    moved out of range, skipped and Reconciled Occurrences.
  - Forecast: Overdue counted today, Transfers between two forecast Wallets, no Balance check.
  - The summary's sign rule, merged Categories, and averages over a short history.
  - Both OFX dialects, QFX and QBO headers, and the import mapping.
- **Integration (`*.int.test.ts`):** every Finances route, including:
  - 403 without access, and access for the Admin
  - the locked fields on imported Actuals
  - de-duplication across Transactions, Transfers and ignored rows
  - every command's transaction behaviour
  - the filter rejection on on-demand queries
- **Browser/component:** the sidebar contexts, and the Occurrence inline editor.
- **E2E (Playwright, one spec per section):**
  - Shell navigation (3.3)
  - Create a Wallet and enter a Balance check, then see the Forecast with a Schedule on it
  - Override and skip an Occurrence
  - Upload a sample OFX, confirm a suggested Reconcile, and re-upload to see "0 added"
  - Monthly summary month arrows and a Category merge

## 10. Slices (build order)

Each slice is vertical: migration, server, client and tests together. `to-issues` may split a
slice, but must keep this order where a later slice depends on an earlier one.

1. **Replace Notes with an empty Finances App** (3.1)
2. **The Admin holds every App** (3.2)
3. **App sidebar and App switcher** (3.3)
4. **Wallets and Balance checks**:
   - tables `wallets`, `balance-checks`
   - the on-demand collection factory
   - the Wallets list, and the Wallet page's Balance checks and Settings tabs
   - the Balance check dialog
5. **Accounts and Categories**: tables, the pickers with inline add, and the Categories list
6. **Schedules**:
   - tables `schedules`, `occurrences`
   - `occurrences.ts`
   - the list and the Schedule page with every action
7. **Home Forecast**:
   - the `settings` table
   - `forecast.ts`
   - tabs, the Wallet view, the All view, open-here and the horizon
8. **Hand entry**:
   - the `transactions` and `transfers` tables
   - the Add dialog and the + button
   - Wallet Activity with Upcoming one-offs and the row editor
   - one-offs and Transfers in the Forecast
9. **Reconcile and Transfers**:
   - `reconcile.ts`
   - the reconcile, unreconcile, mark-transfer and pair commands
   - the To review panel, Pick another, and the Reconcile option on Add
10. **OFX/QFX/QBO upload**: `ofx.ts`, `/uploads`, Wallet mapping, hand-entry twins, Transfer halves,
    ignored lines
11. **Attention**: the banner and the bell with item links (7.8)
12. **Monthly summary and Category pages**: `summary.ts`, the summary screen, the Category page,
    merge, archive
13. **One-time import**: the extract script, `pnpm finances:import`, the mapping and the report

## 11. Manual steps only the user can do

1. Run the extract against the Access file locally, and keep it in `exports/`.
2. Run `pnpm finances:import --dry-run`, then the real run, against a local database. Check the
   report.
3. Take a manual Railway backup (`docs/restore.md`), then run the import against production.
4. Enter today's Balance check for Checking and each card. Review the imported Schedules' next
   dates.
5. Once the household is using the app, delete the Access file and the extract.

## 12. Out of scope

- Investment tracking: the provider's own app covers it.
- The shared two-person ledger: the import drops the shares.
- Debt tracking: loan Wallets, principal and interest, payoff.
- SimpleFIN or any live bank feed. A later source plugs into the same keyed import.
- Splits, budgets, Category groups, an "estimated" marking on untouched Occurrences, and a
  Statement record.
- Push notifications and server-side Forecasts.
- Offline Finances.

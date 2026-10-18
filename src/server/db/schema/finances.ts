// The Finances App's tables. Every row is shared household data, so no table has an owner column.
import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/** The client supplies a UUIDv7; the default is only a fallback. */
function idColumn() {
  return uuid()
    .primaryKey()
    .default(sql`uuidv7()`)
}

function timestamps() {
  return {
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  }
}

/** Someone money is paid to or received from, such as a landlord or an employer. */
export const financesAccounts = pgTable(
  "finances_accounts",
  {
    id: idColumn(),
    name: text().notNull(),
    note: text().notNull().default(""),
    archived: boolean().notNull().default(false),
    ...timestamps(),
  },
  // Names are unique regardless of case, as the pickers compare them.
  (table) => [uniqueIndex("finances_accounts_name_unique").on(sql`lower(${table.name})`)],
)

/** A flat reporting label; archived or merged, never deleted. */
export const financesCategories = pgTable(
  "finances_categories",
  {
    id: idColumn(),
    name: text().notNull(),
    archived: boolean().notNull().default(false),
    mergedIntoId: uuid().references((): AnyPgColumn => financesCategories.id),
    ...timestamps(),
  },
  (table) => [uniqueIndex("finances_categories_name_unique").on(sql`lower(${table.name})`)],
)

/** A place money is held, such as checking, a credit card or cash. */
export const financesWallets = pgTable(
  "finances_wallets",
  {
    id: idColumn(),
    name: text().notNull(),
    inForecast: boolean().notNull().default(false),
    lowBalanceThresholdCents: bigint({ mode: "number" }).notNull().default(0),
    shownAsOwed: boolean().notNull().default(false),
    /** SHA-256 of the OFX BANKID/ACCTID pair. A full account number is never stored. */
    bankAccountHash: text().unique("finances_wallets_bank_account_hash_unique"),
    bankAccountLast4: text(),
    archived: boolean().notNull().default(false),
    ...timestamps(),
  },
  // Names are unique regardless of case, as for Accounts and Categories.
  (table) => [uniqueIndex("finances_wallets_name_unique").on(sql`lower(${table.name})`)],
)

/** A Wallet's posted end-of-day balance on a date, as the bank shows it. One per Wallet per date. */
export const financesBalanceChecks = pgTable(
  "finances_balance_checks",
  {
    id: idColumn(),
    walletId: uuid()
      .notNull()
      .references(() => financesWallets.id),
    date: date({ mode: "string" }).notNull(),
    amountCents: bigint({ mode: "number" }).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("finances_balance_checks_wallet_date_unique").on(table.walletId, table.date),
  ],
)

/** A recurrence that makes Planned Transactions, or Transfers when `toWalletId` is set. */
export const financesSchedules = pgTable(
  "finances_schedules",
  {
    id: idColumn(),
    accountId: uuid().references(() => financesAccounts.id),
    /** The Wallet it draws on, or a Transfer's from Wallet. */
    walletId: uuid()
      .notNull()
      .references(() => financesWallets.id),
    toWalletId: uuid().references(() => financesWallets.id),
    /** Signed for a Transaction; positive for a Transfer, moved from `walletId` to `toWalletId`. */
    amountCents: bigint({ mode: "number" }).notNull(),
    unit: text({ enum: ["week", "month"] }).notNull(),
    every: integer().notNull(),
    startDate: date({ mode: "string" }).notNull(),
    /** Inclusive; null while the Schedule runs on. */
    endDate: date({ mode: "string" }),
    categoryId: uuid().references(() => financesCategories.id),
    note: text().notNull().default(""),
    predecessorId: uuid().references((): AnyPgColumn => financesSchedules.id),
    ...timestamps(),
  },
  (table) => [
    check("finances_schedules_unit", sql`${table.unit} in ('week', 'month')`),
    check("finances_schedules_every", sql`${table.every} >= 1`),
    check("finances_schedules_transfer_wallets", sql`${table.toWalletId} <> ${table.walletId}`),
    check("finances_schedules_end_after_start", sql`${table.endDate} >= ${table.startDate}`),
    // A Transfer never counts as spending or income, so it has no Category.
    check(
      "finances_schedules_transfer_no_category",
      sql`${table.toWalletId} is null or ${table.categoryId} is null`,
    ),
    check(
      "finances_schedules_transfer_positive",
      sql`${table.toWalletId} is null or ${table.amountCents} > 0`,
    ),
  ],
)

/**
 * An Occurrence a person overrode or skipped (or, later, Reconciled), keyed by its Schedule and
 * nominal date. Untouched Occurrences are computed, never stored. On a card payment the override
 * amount and date read "Statement balance" and "Due date"; there are no extra columns.
 */
export const financesOccurrences = pgTable(
  "finances_occurrences",
  {
    id: idColumn(),
    scheduleId: uuid()
      .notNull()
      .references(() => financesSchedules.id),
    nominalDate: date({ mode: "string" }).notNull(),
    overrideAmountCents: bigint({ mode: "number" }),
    overrideDate: date({ mode: "string" }),
    skipped: boolean().notNull().default(false),
    reconciledTransactionId: uuid()
      .unique("finances_occurrences_reconciled_transaction_unique")
      .references((): AnyPgColumn => financesTransactions.id),
    reconciledTransferId: uuid()
      .unique("finances_occurrences_reconciled_transfer_unique")
      .references((): AnyPgColumn => financesTransfers.id),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("finances_occurrences_schedule_nominal_unique").on(
      table.scheduleId,
      table.nominalDate,
    ),
    // An untouched Occurrence is computed, never stored.
    check(
      "finances_occurrences_touched",
      sql`${table.overrideAmountCents} is not null or ${table.overrideDate} is not null or ${table.skipped} or ${table.reconciledTransactionId} is not null or ${table.reconciledTransferId} is not null`,
    ),
    check(
      "finances_occurrences_one_link",
      sql`${table.reconciledTransactionId} is null or ${table.reconciledTransferId} is null`,
    ),
  ],
)

/**
 * A row of money in or out of one Wallet: Planned (a one-off entered by hand) or Actual (entered
 * by hand or imported). Signed cents, money out negative.
 */
export const financesTransactions = pgTable(
  "finances_transactions",
  {
    id: idColumn(),
    status: text({ enum: ["planned", "actual"] }).notNull(),
    walletId: uuid()
      .notNull()
      .references(() => financesWallets.id),
    date: date({ mode: "string" }).notNull(),
    amountCents: bigint({ mode: "number" }).notNull(),
    accountId: uuid().references(() => financesAccounts.id),
    categoryId: uuid().references(() => financesCategories.id),
    note: text().notNull().default(""),
    bankDescription: text(),
    /** Where an Actual came from; null on a Planned row. */
    source: text({ enum: ["manual", "ofx", "access"] }),
    /** The FITID, a content hash or the old id; null on hand-entered rows. */
    sourceKey: text(),
    /** An imported Actual a person deleted: kept, so a re-upload does not add it again. */
    ignored: boolean().notNull().default(false),
    /** When a person resolved its To review entry. */
    reviewedAt: timestamp({ withTimezone: true }),
    /** Set on a one-off Planned row once it is Reconciled to this Actual. */
    reconciledActualId: uuid()
      .unique("finances_transactions_reconciled_actual_unique")
      .references((): AnyPgColumn => financesTransactions.id),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("finances_transactions_source_key_unique")
      .on(table.walletId, table.source, table.sourceKey)
      .where(sql`${table.sourceKey} is not null`),
    index("finances_transactions_wallet_date").on(table.walletId, table.date),
    check("finances_transactions_status", sql`${table.status} in ('planned', 'actual')`),
    check(
      "finances_transactions_source",
      sql`${table.source} is null or ${table.source} in ('manual', 'ofx', 'access')`,
    ),
    // Only an Actual came from somewhere, can be ignored or be the target of a Reconcile.
    check(
      "finances_transactions_planned_has_no_source",
      sql`${table.status} = 'actual' or (${table.source} is null and ${table.sourceKey} is null and not ${table.ignored})`,
    ),
    check(
      "finances_transactions_only_planned_reconciles",
      sql`${table.reconciledActualId} is null or ${table.status} = 'planned'`,
    ),
  ],
)

/**
 * Money moved between two of the household's Wallets: Planned (a one-off entered by hand) or
 * Actual. It is not a Transaction and has no Category, so it never counts as spending or income.
 * The amount is positive, moved from `fromWalletId` to `toWalletId`. Each side keeps where its
 * line came from, so an upload to either Wallet never adds that side again.
 */
export const financesTransfers = pgTable(
  "finances_transfers",
  {
    id: idColumn(),
    status: text({ enum: ["planned", "actual"] }).notNull(),
    date: date({ mode: "string" }).notNull(),
    amountCents: bigint({ mode: "number" }).notNull(),
    fromWalletId: uuid()
      .notNull()
      .references(() => financesWallets.id),
    toWalletId: uuid()
      .notNull()
      .references(() => financesWallets.id),
    accountId: uuid().references(() => financesAccounts.id),
    note: text().notNull().default(""),
    /** Where the from side's line came from; null on a Planned row. */
    fromSource: text({ enum: ["manual", "ofx", "access"] }),
    /** The from side's FITID, content hash or old id; null on hand-entered sides. */
    fromSourceKey: text(),
    fromBankDescription: text(),
    /** Where the to side's line came from; null on a Planned row. */
    toSource: text({ enum: ["manual", "ofx", "access"] }),
    toSourceKey: text(),
    toBankDescription: text(),
    /** An imported Actual Transfer a person deleted: kept, so a re-upload does not add it again. */
    ignored: boolean().notNull().default(false),
    /** Set on a one-off Planned Transfer once it is Reconciled to this Actual Transfer. */
    reconciledActualId: uuid()
      .unique("finances_transfers_reconciled_actual_unique")
      .references((): AnyPgColumn => financesTransfers.id),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("finances_transfers_from_source_key_unique")
      .on(table.fromWalletId, table.fromSource, table.fromSourceKey)
      .where(sql`${table.fromSourceKey} is not null`),
    uniqueIndex("finances_transfers_to_source_key_unique")
      .on(table.toWalletId, table.toSource, table.toSourceKey)
      .where(sql`${table.toSourceKey} is not null`),
    index("finances_transfers_from_wallet_date").on(table.fromWalletId, table.date),
    index("finances_transfers_to_wallet_date").on(table.toWalletId, table.date),
    check("finances_transfers_status", sql`${table.status} in ('planned', 'actual')`),
    check("finances_transfers_positive", sql`${table.amountCents} > 0`),
    check("finances_transfers_two_wallets", sql`${table.fromWalletId} <> ${table.toWalletId}`),
    check(
      "finances_transfers_source",
      sql`(${table.fromSource} is null or ${table.fromSource} in ('manual', 'ofx', 'access')) and (${table.toSource} is null or ${table.toSource} in ('manual', 'ofx', 'access'))`,
    ),
    // Only an Actual Transfer came from somewhere, can be ignored or be the target of a Reconcile.
    check(
      "finances_transfers_planned_has_no_source",
      sql`${table.status} = 'actual' or (${table.fromSource} is null and ${table.fromSourceKey} is null and ${table.toSource} is null and ${table.toSourceKey} is null and not ${table.ignored})`,
    ),
    check(
      "finances_transfers_only_planned_reconciles",
      sql`${table.reconciledActualId} is null or ${table.status} = 'planned'`,
    ),
  ],
)

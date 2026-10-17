// The Finances App's tables. Every row is shared household data, so no table has an owner column.
import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
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

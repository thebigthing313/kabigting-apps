// The Finances App's tables. Every row is shared household data, so no table has an owner column.
import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  bigint,
  boolean,
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

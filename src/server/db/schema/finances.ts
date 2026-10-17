// The Finances App's tables. Every row is shared household data, so no table has an owner column.
import { sql } from "drizzle-orm"
import { bigint, boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

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

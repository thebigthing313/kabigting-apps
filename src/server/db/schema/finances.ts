// The Finances App's tables. Rows are shared by everyone with Finances access: no owner column.
import { sql } from "drizzle-orm"
import { bigint, boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

// The client supplies a UUIDv7; the default is only a fallback.
const columns = {
  id: () =>
    uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
  createdAt: () => timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: () => timestamp({ withTimezone: true }).notNull().defaultNow(),
}

/** A place money is held, such as checking, a credit card or cash. */
export const financesWallets = pgTable("finances_wallets", {
  id: columns.id(),
  name: text().notNull().unique(),
  inForecast: boolean().notNull().default(false),
  lowBalanceThresholdCents: bigint({ mode: "number" }).notNull().default(0),
  shownAsOwed: boolean().notNull().default(false),
  /** SHA-256 of the OFX BANKID/ACCTID pair. A full account number is never stored. */
  bankAccountHash: text().unique("finances_wallets_bank_account_hash_unique"),
  bankAccountLast4: text(),
  archived: boolean().notNull().default(false),
  createdAt: columns.createdAt(),
  updatedAt: columns.updatedAt(),
})

// The Finances App's tables. Every row is shared household data, so no table has an owner column.
import { sql } from "drizzle-orm"
import { type AnyPgColumn, boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

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
export const financesAccounts = pgTable("finances_accounts", {
  id: idColumn(),
  name: text().notNull().unique(),
  note: text().notNull().default(""),
  archived: boolean().notNull().default(false),
  ...timestamps(),
})

/** A flat reporting label; archived or merged, never deleted. */
export const financesCategories = pgTable("finances_categories", {
  id: idColumn(),
  name: text().notNull().unique(),
  archived: boolean().notNull().default(false),
  mergedIntoId: uuid().references((): AnyPgColumn => financesCategories.id),
  ...timestamps(),
})

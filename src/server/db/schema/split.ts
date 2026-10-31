// The Split App's tables. Members are not stored: they are the Admin plus every Account holding
// App access to Split. Every row is shared by the Members, so nothing here has an owner column.
import { sql } from "drizzle-orm"
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import type { Side } from "#shared/split/schemas.ts"
import { auth_user } from "./auth.ts"

/** The client supplies a UUIDv7; the default is only a fallback. */
function idColumn() {
  return uuid()
    .primaryKey()
    .default(sql`uuidv7()`)
}

/** A flat label every Expense carries. Archived, never deleted; twelve are seeded. */
export const splitCategories = pgTable(
  "split_categories",
  {
    id: idColumn(),
    name: text().notNull(),
    archived: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // Names are unique regardless of case, as in Finances.
  (table) => [uniqueIndex("split_categories_name_unique").on(sql`lower(${table.name})`)],
)

/**
 * One shared cost. Each side's Split mode and inputs are kept only so the form reopens as it was
 * entered; the shares in `split_shares` are the truth for Balances.
 */
export const splitExpenses = pgTable(
  "split_expenses",
  {
    id: idColumn(),
    description: text().notNull(),
    date: date({ mode: "string" }).notNull(),
    /** Cents, never zero: positive for a cost, negative for a Refund (not an outflow Amount). */
    totalCents: bigint({ mode: "number" }).notNull(),
    categoryId: uuid()
      .notNull()
      .references(() => splitCategories.id),
    note: text().notNull().default(""),
    paid: jsonb().$type<Side>().notNull(),
    owed: jsonb().$type<Side>().notNull(),
    // Accounts are never deleted (a Removed Account keeps its data), so nothing cascades.
    addedById: text()
      .notNull()
      .references(() => auth_user.id),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    changedById: text()
      .notNull()
      .references(() => auth_user.id),
    changedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("split_expenses_total_not_zero", sql`${table.totalCents} <> 0`),
    index("split_expenses_date").on(table.date),
    index("split_expenses_category_id").on(table.categoryId),
  ],
)

/**
 * A Paid share or an Owed share: the cents worked out at save, one row per Member per side, and
 * only when not zero. Each side's shares sum to the Expense's total.
 */
export const splitShares = pgTable(
  "split_shares",
  {
    expenseId: uuid()
      .notNull()
      .references(() => splitExpenses.id, { onDelete: "cascade" }),
    side: text({ enum: ["paid", "owed"] }).notNull(),
    accountId: text()
      .notNull()
      .references(() => auth_user.id),
    cents: bigint({ mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.expenseId, table.side, table.accountId] }),
    check("split_shares_side", sql`${table.side} in ('paid', 'owed')`),
    check("split_shares_not_zero", sql`${table.cents} <> 0`),
    index("split_shares_account_id").on(table.accountId),
  ],
)

/** Money one Member handed another, to settle up or as a loan. It has no Category. */
export const splitPayments = pgTable(
  "split_payments",
  {
    id: idColumn(),
    date: date({ mode: "string" }).notNull(),
    fromId: text()
      .notNull()
      .references(() => auth_user.id),
    toId: text()
      .notNull()
      .references(() => auth_user.id),
    /** Cents, always positive: what `fromId` handed `toId`. */
    amountCents: bigint({ mode: "number" }).notNull(),
    note: text().notNull().default(""),
    addedById: text()
      .notNull()
      .references(() => auth_user.id),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    changedById: text()
      .notNull()
      .references(() => auth_user.id),
    changedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("split_payments_amount_positive", sql`${table.amountCents} > 0`),
    check("split_payments_between_two", sql`${table.fromId} <> ${table.toId}`),
    index("split_payments_date").on(table.date),
    index("split_payments_from_id").on(table.fromId),
    index("split_payments_to_id").on(table.toId),
  ],
)

import { sql } from "drizzle-orm"
import { bigint, date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { auth_user } from "./auth.ts"

/** Disposable: proves the round trip; deleted when the finances port begins. */
export const skeletonNotes = pgTable("skeleton_notes", {
  // The client supplies a UUIDv7; the default is only a fallback.
  id: uuid()
    .primaryKey()
    .default(sql`uuidv7()`),
  userId: text()
    .notNull()
    .references(() => auth_user.id, { onDelete: "cascade" }),
  text: text().notNull(),
  amountCents: bigint({ mode: "number" }).notNull(),
  onDate: date({ mode: "string" }).notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

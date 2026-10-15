import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { auth_user } from "./auth.ts"

/**
 * The temporary password the Admin issued, kept so the Admin can read it again until the Account
 * replaces it. Never a Better Auth field, so it is never part of a session.
 */
export const temporaryPasswords = pgTable("temporary_password", {
  userId: text()
    .primaryKey()
    .references(() => auth_user.id, { onDelete: "cascade" }),
  password: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

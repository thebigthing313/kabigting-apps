import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"
import { auth_user } from "./auth.ts"

/** Default deny: an Account may use an App only with a row here. */
export const appAccess = pgTable(
  "app_access",
  {
    userId: text()
      .notNull()
      .references(() => auth_user.id, { onDelete: "cascade" }),
    appKey: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.appKey] })],
)

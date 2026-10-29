// The Notes App's tables. Unlike Finances, every Note has a Creator and is seen only by those it
// is visible to; see docs/notes/adr/0001-per-note-audience.md.
import { sql } from "drizzle-orm"
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { auth_user } from "./auth.ts"

/** A Text note or a Checklist. Its kind and Creator never change. */
export const notes = pgTable(
  "notes",
  {
    // The client supplies a UUIDv7; the default is only a fallback.
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    kind: text({ enum: ["text", "checklist"] }).notNull(),
    /** One line; null when the Note has none. */
    title: text(),
    /** Plain text exactly as typed; null for a Checklist. */
    body: text(),
    // Accounts are never deleted (a Removed Account keeps its data), so nothing cascades.
    creatorId: text()
      .notNull()
      .references(() => auth_user.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Server time of the last content change. */
    editedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("notes_kind", sql`${table.kind} in ('text', 'checklist')`),
    check("notes_body_only_on_text", sql`(${table.kind} = 'text') = (${table.body} is not null)`),
    index("notes_creator_id").on(table.creatorId),
  ],
)

/**
 * A Note's Audience: the Accounts, besides its Creator, it is shared with. The Creator has no row,
 * so a Note with no rows is private. Removing a member deletes the row, so adding them again
 * inserts a fresh one. Losing App access or becoming a Removed Account leaves the row in place.
 */
export const noteAudience = pgTable(
  "note_audience",
  {
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    accountId: text()
      .notNull()
      .references(() => auth_user.id),
    /** Server time this Account was last added. */
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Server time this Account first opened the Note since being added; null while Unopened. */
    openedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.accountId] }),
    index("note_audience_account_id").on(table.accountId),
  ],
)

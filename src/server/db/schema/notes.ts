// The Notes App's tables. Unlike Finances, every Note has a Creator and is seen only by those it
// is visible to; see docs/notes/adr/0001-per-note-audience.md.
import { sql } from "drizzle-orm"
import { boolean, check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
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

/** One line of a Checklist. Deleting the Checklist deletes its Items. */
export const noteItems = pgTable(
  "note_items",
  {
    // The client supplies a UUIDv7; the default is only a fallback.
    id: uuid()
      .primaryKey()
      .default(sql`uuidv7()`),
    noteId: uuid()
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    /** One line, exactly as typed. */
    text: text().notNull(),
    checked: boolean().notNull().default(false),
    /** Server time of the tick; null while unchecked. */
    checkedAt: timestamp({ withTimezone: true }),
    /** A sortable key among the unchecked Items; see `orderItems` in shared/notes/items.ts. */
    position: text().notNull(),
  },
  (table) => [
    check("note_items_checked_at", sql`${table.checked} = (${table.checkedAt} is not null)`),
    index("note_items_note_id").on(table.noteId),
  ],
)

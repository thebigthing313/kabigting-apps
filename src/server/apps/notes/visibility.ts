import { sql, type SQL } from "drizzle-orm"
import { noteAudience, notes } from "#server/db/schema/index.ts"

/**
 * The one rule for which Notes an Account may see: its Creator, and every Account in its Audience.
 * Every Notes read and content write filters by it, Items included through their Note. A Note that
 * fails it answers 404, so its existence never leaks. The Admin gets no bypass
 * (docs/notes/adr/0001-per-note-audience.md).
 */
export function visibleTo(accountId: string): SQL {
  return sql`(${notes.creatorId} = ${accountId} or exists (select 1 from ${noteAudience} where ${noteAudience.noteId} = ${notes.id} and ${noteAudience.accountId} = ${accountId}))`
}

import { and, eq, exists, or, sql, type SQL } from "drizzle-orm"
import { subquery } from "#server/db/client.ts"
import { noteAudience, notes } from "#server/db/schema/index.ts"

/**
 * The one rule for which Notes an Account may see: its Creator, and every Account in its Audience.
 * Every Notes read and content write filters by it, Items included through their Note. A Note that
 * fails it answers 404, so its existence never leaks. The Admin gets no bypass
 * (docs/notes/adr/0001-per-note-audience.md).
 */
export function visibleTo(accountId: string): SQL {
  const inAudience = subquery
    .select({ noteId: noteAudience.noteId })
    .from(noteAudience)
    .where(and(eq(noteAudience.noteId, notes.id), eq(noteAudience.accountId, accountId)))
  return or(eq(notes.creatorId, accountId), exists(inAudience)) ?? sql`false`
}

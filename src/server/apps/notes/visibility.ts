import { eq, type SQL } from "drizzle-orm"
import { notes } from "#server/db/schema/index.ts"

/**
 * The one rule for which Notes an Account may see: every Notes read and content write filters by
 * it. A Note that fails it answers 404, so its existence never leaks. The Admin gets no bypass
 * (docs/notes/adr/0001-per-note-audience.md).
 *
 * For now only the Creator sees a Note; the Audience joins this predicate when sharing arrives.
 */
export function visibleTo(accountId: string): SQL {
  return eq(notes.creatorId, accountId)
}

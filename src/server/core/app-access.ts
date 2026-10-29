import { and, eq, exists, isNull, or, sql, type SQL } from "drizzle-orm"
import { subquery } from "#server/db/client.ts"
import { appAccess, auth_user } from "#server/db/schema/index.ts"

/**
 * The Shell's App access rule as a condition on `auth_user` rows: the Account holds the App when
 * it is the Admin (who holds every App through the role) or has an access row for it, and is not
 * a Removed Account.
 */
export function holdsAppAccess(appKey: string): SQL {
  const granted = subquery
    .select({ appKey: appAccess.appKey })
    .from(appAccess)
    .where(and(eq(appAccess.userId, auth_user.id), eq(appAccess.appKey, appKey)))
  return (
    and(
      or(eq(auth_user.role, "admin"), exists(granted)),
      or(isNull(auth_user.banned), eq(auth_user.banned, false)),
    ) ?? sql`false`
  )
}

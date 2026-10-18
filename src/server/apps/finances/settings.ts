import { eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { z } from "zod"
import type { AppEnv } from "#server/core/context.ts"
import { ApiError } from "#server/core/errors.ts"
import { validate } from "#server/core/validate.ts"
import type { Db } from "#server/db/client.ts"
import { financesSettings, financesWallets } from "#server/db/schema/index.ts"
import {
  SETTINGS_ID,
  settingsQuery,
  updateSettings,
  type SettingsRow,
} from "#shared/finances/schemas.ts"

type SettingsRecord = typeof financesSettings.$inferSelect

function toRow(settings: SettingsRecord): SettingsRow {
  return {
    id: SETTINGS_ID,
    openOnHomeWalletId: settings.openOnHomeWalletId,
    createdAt: settings.createdAt.toISOString(),
    updatedAt: settings.updatedAt.toISOString(),
  }
}

const params = z.strictObject({ id: z.string() })

/** Home opens on All or on a forecast Wallet; any other Wallet is the caller's mistake. */
async function checkOpenOnHome(db: Db, walletId: string | null | undefined) {
  if (walletId == null) return
  const [wallet] = await db
    .select({ inForecast: financesWallets.inForecast, archived: financesWallets.archived })
    .from(financesWallets)
    .where(eq(financesWallets.id, walletId))
  if (!wallet || !wallet.inForecast || wallet.archived) {
    throw new ApiError("validation_failed", "Home opens on All or on a Wallet in the forecast")
  }
}

/**
 * The household's one settings row, seeded by its migration. It has only query and PATCH.
 * Mounted under the Finances router, which has already checked the session and App access.
 */
export function settingsRoutes(db: Db) {
  return new Hono<AppEnv>()
    .post("/query", validate("json", settingsQuery), async (c) => {
      const rows = await db.select().from(financesSettings)
      return c.json({ rows: rows.map(toRow) })
    })
    .patch("/:id", validate("param", params), validate("json", updateSettings), async (c) => {
      if (c.req.valid("param").id !== SETTINGS_ID) {
        throw new ApiError("not_found", "No such settings row")
      }
      const changes = c.req.valid("json")
      await checkOpenOnHome(db, changes.openOnHomeWalletId)
      const [settings] = await db
        .update(financesSettings)
        .set({ ...changes, updatedAt: sql`now()` })
        .where(eq(financesSettings.id, SETTINGS_ID))
        .returning()
      if (!settings) throw new ApiError("not_found", "No such settings row")
      return c.json(toRow(settings))
    })
}

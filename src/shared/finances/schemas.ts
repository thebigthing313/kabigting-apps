/** Wire schemas for the Finances App's resources. */
import { z } from "zod"
import { cents, id, instant } from "../schemas/primitives.ts"
import { queryBody, rowsResponse } from "../schemas/query.ts"

const name = z.string().trim().min(1, "Give it a name").max(100, "Keep it under 100 characters")

// Wallets

const walletSettings = {
  name,
  inForecast: z.boolean(),
  lowBalanceThresholdCents: cents,
  shownAsOwed: z.boolean(),
}

export const createWallet = z.strictObject({
  id,
  ...walletSettings,
  inForecast: walletSettings.inForecast.optional(),
  lowBalanceThresholdCents: walletSettings.lowBalanceThresholdCents.optional(),
  shownAsOwed: walletSettings.shownAsOwed.optional(),
})

export const updateWallet = z
  .strictObject({
    ...walletSettings,
    archived: z.boolean(),
    // Only "Forget" is allowed: uploads remember the bank account, people only clear it.
    bankAccountLast4: z.null(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, "Change at least one field")

export const walletRow = z.object({
  id,
  name: z.string(),
  inForecast: z.boolean(),
  lowBalanceThresholdCents: cents,
  shownAsOwed: z.boolean(),
  /** The last four digits of the bank account an upload was mapped to; never the full number. */
  bankAccountLast4: z.string().nullable(),
  archived: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
})

export const walletQuery = queryBody({})
export const walletRows = rowsResponse(walletRow)

export type CreateWallet = z.infer<typeof createWallet>
export type UpdateWallet = z.infer<typeof updateWallet>
export type WalletRow = z.infer<typeof walletRow>

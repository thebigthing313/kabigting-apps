/** Wire schemas for the Finances App's resources. */
import { z } from "zod"
import { cents, id, instant, isoDate } from "../schemas/primitives.ts"
import { queryBody, rowsResponse } from "../schemas/query.ts"

/** A unique display name, trimmed; the database enforces uniqueness. */
const name = z.string().trim().min(1, "Enter a name").max(100)
const note = z.string().trim().max(1000)

function atLeastOneField(patch: object) {
  return Object.keys(patch).length > 0
}

// Accounts: whoever money is paid to or received from.

export const createAccount = z.strictObject({ id, name, note: note.optional() })

export const updateAccount = z
  .strictObject({ name, note, archived: z.boolean() })
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const accountRow = z.object({
  id,
  name: z.string(),
  note: z.string(),
  archived: z.boolean(),
  createdAt: instant,
  updatedAt: instant,
})

export const accountQuery = queryBody({})
export const accountRows = rowsResponse(accountRow)

export type UpdateAccount = z.infer<typeof updateAccount>
export type AccountRow = z.infer<typeof accountRow>

// Categories: one flat list of reporting labels, archived or merged but never deleted.

export const createCategory = z.strictObject({ id, name })

export const updateCategory = z
  .strictObject({ name, archived: z.boolean() })
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const categoryRow = z.object({
  id,
  name: z.string(),
  archived: z.boolean(),
  mergedIntoId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

export const categoryQuery = queryBody({})
export const categoryRows = rowsResponse(categoryRow)

export type UpdateCategory = z.infer<typeof updateCategory>
export type CategoryRow = z.infer<typeof categoryRow>

// Wallets: places money is held, such as checking, a card or cash.

const walletSettings = {
  name,
  inForecast: z.boolean(),
  lowBalanceThresholdCents: cents,
  shownAsOwed: z.boolean(),
}

export const createWallet = z.strictObject({
  id,
  name,
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
  .refine(atLeastOneField, "Change at least one field")

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

export type UpdateWallet = z.infer<typeof updateWallet>
export type WalletRow = z.infer<typeof walletRow>

// Schedules: recurrences that make Planned Transactions or Transfers.

export const scheduleUnit = z.enum(["week", "month"])

const scheduleFields = {
  /** The Wallet it draws on, or a Transfer's from Wallet. */
  walletId: id,
  /** Set only for a Transfer Schedule: the Wallet the money moves to. */
  toWalletId: id.nullable(),
  accountId: id.nullable(),
  /** Signed for a Transaction; positive for a Transfer, as money moved out of `walletId`. */
  amountCents: cents,
  unit: scheduleUnit,
  every: z.int().min(1).max(999),
  startDate: isoDate,
  /** The last day an Occurrence may fall on, inclusive. */
  endDate: isoDate.nullable(),
  categoryId: id.nullable(),
}

type ScheduleShape = {
  walletId: string
  toWalletId: string | null
  amountCents: number
  startDate: string
  endDate: string | null
  categoryId: string | null
}

/** The rules a whole Schedule keeps. The database checks them again on every write. */
function scheduleRules(schedule: ScheduleShape, context: z.RefinementCtx) {
  const issue = (path: string, message: string) =>
    context.addIssue({ code: "custom", path: [path], message })
  if (schedule.toWalletId === schedule.walletId) {
    issue("toWalletId", "A Transfer goes to a different Wallet")
  }
  if (schedule.toWalletId !== null && schedule.categoryId !== null) {
    issue("categoryId", "A Transfer has no Category")
  }
  if (schedule.toWalletId !== null && schedule.amountCents <= 0) {
    issue("amountCents", "A Transfer moves a positive amount")
  }
  if (schedule.endDate !== null && schedule.endDate < schedule.startDate) {
    issue("endDate", "The end date can't be before the start date")
  }
}

export const createSchedule = z
  .strictObject({
    id,
    ...scheduleFields,
    toWalletId: scheduleFields.toWalletId.default(null),
    accountId: scheduleFields.accountId.default(null),
    endDate: scheduleFields.endDate.default(null),
    categoryId: scheduleFields.categoryId.default(null),
    note: note.default(""),
  })
  .superRefine(scheduleRules)

/**
 * Only the labels change in place. Terms change from a date, which ends the Schedule and starts a
 * successor, so its history stays true.
 */
export const updateSchedule = z
  .strictObject({
    accountId: scheduleFields.accountId,
    categoryId: scheduleFields.categoryId,
    note,
  })
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const scheduleRow = z.object({
  id,
  ...scheduleFields,
  note: z.string(),
  /** The Schedule this one continues, after a change from a date. */
  predecessorId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

export const scheduleQuery = queryBody({})
export const scheduleRows = rowsResponse(scheduleRow)

export type CreateSchedule = z.input<typeof createSchedule>
export type UpdateSchedule = z.infer<typeof updateSchedule>
export type ScheduleRow = z.infer<typeof scheduleRow>

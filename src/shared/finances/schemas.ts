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

/**
 * The fixed set of filters the on-demand resources (Transactions, Transfers, Balance checks)
 * draw from, beside the base `ids`, `limit` and `after`. Each resource accepts the ones that
 * apply to it and rejects anything else. Dates are inclusive; `after` is the id of the last row
 * of the previous page, in the requested order.
 */
export const onDemandFilters = {
  walletId: id,
  dateFrom: isoDate,
  dateTo: isoDate,
  /** null means Uncategorised. */
  categoryId: id.nullable(),
  status: z.enum(["planned", "actual"]),
  /** true keeps only Actuals no one has reviewed yet. */
  unreviewed: z.boolean(),
  /** true adds ignored rows, which are left out by default. */
  includeIgnored: z.boolean(),
  order: z.enum(["dateAsc", "dateDesc"]),
}

/** A query an on-demand collection can send: the fixed filters plus paging. */
export type OnDemandQuery = {
  [Key in keyof typeof onDemandFilters]?: z.infer<(typeof onDemandFilters)[Key]>
} & { ids?: string[]; limit?: number; after?: string }

// Balance checks: a Wallet's actual balance on a date, as entered from the bank.

export const createBalanceCheck = z.strictObject({
  id,
  walletId: id,
  date: isoDate,
  amountCents: cents,
})

export const updateBalanceCheck = z
  .strictObject({ date: isoDate, amountCents: cents })
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const balanceCheckRow = z.object({
  id,
  walletId: id,
  date: isoDate,
  amountCents: cents,
  createdAt: instant,
  updatedAt: instant,
})

export const balanceCheckQuery = queryBody({
  walletId: onDemandFilters.walletId.optional(),
  dateFrom: onDemandFilters.dateFrom.optional(),
  dateTo: onDemandFilters.dateTo.optional(),
  order: onDemandFilters.order.optional(),
})
export const balanceCheckRows = rowsResponse(balanceCheckRow)

export type UpdateBalanceCheck = z.infer<typeof updateBalanceCheck>
export type BalanceCheckRow = z.infer<typeof balanceCheckRow>

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
 * Only the labels change in place, and Reopen clears the end date. Terms change from a date, which
 * ends the Schedule and starts a successor, so its history stays true.
 */
export const updateSchedule = z
  .strictObject({
    accountId: scheduleFields.accountId,
    categoryId: scheduleFields.categoryId,
    note,
    endDate: z.null(),
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

/**
 * Change from a date: the Schedule ends the day before `date`, and a successor carries the new
 * terms. Its first Occurrence is `startDate`, on or after `date`, and `date` when left out; any
 * term left out stays as it was. `confirmDeleteOverrides` names the later stored Occurrences the
 * new terms never fall on, which the person agreed to delete; it must be exactly the ones there are.
 */
export const changeScheduleFrom = z.strictObject({
  date: isoDate,
  confirmDeleteOverrides: z.array(id).max(1000),
  changes: z
    .strictObject({
      amountCents: scheduleFields.amountCents,
      unit: scheduleFields.unit,
      every: scheduleFields.every,
      startDate: scheduleFields.startDate,
      endDate: scheduleFields.endDate,
    })
    .partial(),
})

/**
 * End a Schedule on `endDate`. `confirmDeleteOverrides` names the stored Occurrences after it that
 * the person agreed to delete; it must be exactly the ones there are.
 */
export const endSchedule = z.strictObject({
  endDate: isoDate,
  confirmDeleteOverrides: z.array(id).max(1000),
})

export type CreateSchedule = z.input<typeof createSchedule>
export type UpdateSchedule = z.infer<typeof updateSchedule>
export type ScheduleRow = z.infer<typeof scheduleRow>
export type ChangeScheduleFrom = z.infer<typeof changeScheduleFrom>

// Occurrences: stored only once a person overrides or skips one (or it is Reconciled).

/** What a person may change. Reconcile links are set only by the Reconcile command. */
const occurrenceOverride = {
  /** Replaces the Schedule's amount; null keeps it. */
  overrideAmountCents: cents.nullable(),
  /** Moves the Occurrence to this date; null keeps its nominal date. */
  overrideDate: isoDate.nullable(),
  skipped: z.boolean(),
}

export const createOccurrence = z.strictObject({
  id,
  scheduleId: id,
  /** The date the Schedule's terms put it on; with the Schedule, it names the Occurrence. */
  nominalDate: isoDate,
  overrideAmountCents: occurrenceOverride.overrideAmountCents.default(null),
  overrideDate: occurrenceOverride.overrideDate.default(null),
  skipped: occurrenceOverride.skipped.default(false),
})

export const updateOccurrence = z
  .strictObject(occurrenceOverride)
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const occurrenceRow = z.object({
  id,
  scheduleId: id,
  nominalDate: isoDate,
  ...occurrenceOverride,
  reconciledTransactionId: id.nullable(),
  reconciledTransferId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

export const occurrenceQuery = queryBody({})
export const occurrenceRows = rowsResponse(occurrenceRow)

export type CreateOccurrence = z.input<typeof createOccurrence>
export type UpdateOccurrence = z.infer<typeof updateOccurrence>
export type OccurrenceRow = z.infer<typeof occurrenceRow>

/** What a Schedule command changed: rows to upsert, and the stored Occurrences it deleted. */
export const scheduleCommandResult = z.object({
  schedules: z.array(scheduleRow),
  occurrences: z.array(occurrenceRow),
  deletedOccurrences: z.array(id),
})

export type ScheduleCommandResult = z.infer<typeof scheduleCommandResult>

// Transactions: one-off Planned and Actual rows of money in or out of one Wallet.

/** Planned (not happened yet) or Actual (really happened). */
export const transactionStatus = onDemandFilters.status

/** Where an Actual came from: entered by hand, uploaded, or brought over by the import. */
export const transactionSource = z.enum(["manual", "ofx", "access"])

/**
 * An Actual that came from the bank or the old ledger keeps its amount, date and Wallet, and
 * deleting it keeps it as an ignored line.
 */
export function isImported(transaction: {
  source: z.infer<typeof transactionSource> | null
}): boolean {
  return transaction.source !== null && transaction.source !== "manual"
}

/** What a person enters, and may change on a hand-entered row. */
const transactionFields = {
  walletId: id,
  date: isoDate,
  /** Signed: money out is negative. */
  amountCents: cents,
  accountId: id.nullable(),
  categoryId: id.nullable(),
  note,
}

/** A hand-entered one-off Planned or Actual. */
export const createTransaction = z.strictObject({
  id,
  status: transactionStatus,
  ...transactionFields,
  accountId: transactionFields.accountId.default(null),
  categoryId: transactionFields.categoryId.default(null),
  note: note.default(""),
})

/**
 * Planned stays Planned and Actual stays Actual. An imported Actual keeps its amount, date and
 * Wallet; the server refuses changing them. `ignored` can only be cleared, which restores an
 * ignored line; deleting is what ignores one.
 */
export const updateTransaction = z
  .strictObject({ ...transactionFields, ignored: z.literal(false) })
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const transactionRow = z.object({
  id,
  status: transactionStatus,
  ...transactionFields,
  note: z.string(),
  bankDescription: z.string().nullable(),
  /** Null on a Planned row. */
  source: transactionSource.nullable(),
  /** An imported Actual a person deleted, kept so a re-upload does not add it again. */
  ignored: z.boolean(),
  /** When a person resolved its To review entry; hand-entered Actuals never need one. */
  reviewedAt: instant.nullable(),
  /** On a one-off Planned row, the Actual it is Reconciled to. */
  reconciledActualId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

/** Every filter in the fixed set applies to Transactions. */
export const transactionQuery = queryBody({
  walletId: onDemandFilters.walletId.optional(),
  dateFrom: onDemandFilters.dateFrom.optional(),
  dateTo: onDemandFilters.dateTo.optional(),
  categoryId: onDemandFilters.categoryId.optional(),
  status: onDemandFilters.status.optional(),
  unreviewed: onDemandFilters.unreviewed.optional(),
  includeIgnored: onDemandFilters.includeIgnored.optional(),
  order: onDemandFilters.order.optional(),
})
export const transactionRows = rowsResponse(transactionRow)

// Uploads: a bank or card statement download, read into Actuals on one Wallet.

/** All three are OFX with different headers, so one parser reads them (D27). */
export const UPLOAD_EXTENSIONS = [".ofx", ".qfx", ".qbo"] as const

/** The extensions in words, for messages. */
export const UPLOAD_FORMATS = `${UPLOAD_EXTENSIONS.slice(0, -1).join(", ")} or ${UPLOAD_EXTENSIONS.at(-1)}`

/** The file's bank account is new: the client asks which Wallet it is, then sends it again. */
export const uploadNeedsWallet = z.object({
  needsWallet: z.object({ last4: z.string() }),
})

/** The lines added, how many were already stored (ignored ones too), and the file's Wallet. */
export const uploadDone = z.object({
  inserted: z.array(transactionRow),
  duplicates: z.int().min(0),
  wallet: walletRow,
})

export const uploadResult = z.union([uploadNeedsWallet, uploadDone])

export type UploadResult = z.infer<typeof uploadResult>

export type CreateTransaction = z.input<typeof createTransaction>
export type UpdateTransaction = z.infer<typeof updateTransaction>
export type TransactionRow = z.infer<typeof transactionRow>

// Settings: the household's one row of Finances choices, id "household".

export const SETTINGS_ID = "household"

export const updateSettings = z
  .strictObject({
    /** The forecast Wallet home opens on; null means All. */
    openOnHomeWalletId: id.nullable(),
  })
  .partial()
  .refine(atLeastOneField, "Change at least one field")

export const settingsRow = z.object({
  id: z.literal(SETTINGS_ID),
  openOnHomeWalletId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

/** There is one row, so there is nothing to filter by. */
export const settingsQuery = z.strictObject({})
export const settingsRows = rowsResponse(settingsRow)

export type UpdateSettings = z.infer<typeof updateSettings>
export type SettingsRow = z.infer<typeof settingsRow>

// Transfers: money moved between two of the household's Wallets. Not a Transaction, and no
// Category, so never spending or income.

/** What a person enters, and may change on a hand-entered Transfer. */
const transferFields = {
  date: isoDate,
  /** Positive, as money moved from `fromWalletId` to `toWalletId`. */
  amountCents: cents.positive("A Transfer moves a positive amount"),
  fromWalletId: id,
  toWalletId: id,
  accountId: id.nullable(),
  note,
}

function twoWallets(transfer: { fromWalletId?: string; toWalletId?: string }) {
  return transfer.fromWalletId === undefined || transfer.fromWalletId !== transfer.toWalletId
}

const TWO_WALLETS = { message: "A Transfer goes to a different Wallet", path: ["toWalletId"] }

/** A hand-entered one-off Planned Transfer or Actual Transfer. It has no Category. */
export const createTransfer = z
  .strictObject({
    id,
    status: transactionStatus,
    ...transferFields,
    accountId: transferFields.accountId.default(null),
    note: note.default(""),
  })
  .refine(twoWallets, TWO_WALLETS)

/**
 * Planned stays Planned and Actual stays Actual. A side that came from the bank keeps its Wallet,
 * and the amount and date are then the bank's too; the server refuses changing them.
 */
export const updateTransfer = z
  .strictObject(transferFields)
  .partial()
  .refine(atLeastOneField, "Change at least one field")
  .refine(twoWallets, TWO_WALLETS)

export const transferRow = z.object({
  id,
  status: transactionStatus,
  ...transferFields,
  amountCents: cents,
  note: z.string(),
  /** Where each side's line came from; null on a Planned Transfer. */
  fromSource: transactionSource.nullable(),
  fromBankDescription: z.string().nullable(),
  toSource: transactionSource.nullable(),
  toBankDescription: z.string().nullable(),
  /** An imported Actual Transfer a person deleted, kept so a re-upload does not add it again. */
  ignored: z.boolean(),
  /** On a one-off Planned Transfer, the Actual Transfer it is Reconciled to. */
  reconciledActualId: id.nullable(),
  createdAt: instant,
  updatedAt: instant,
})

/**
 * `walletId` keeps the Transfers out of or into that Wallet. A Transfer has no Category and
 * never waits in To review, so those filters are refused.
 */
export const transferQuery = queryBody({
  walletId: onDemandFilters.walletId.optional(),
  dateFrom: onDemandFilters.dateFrom.optional(),
  dateTo: onDemandFilters.dateTo.optional(),
  status: onDemandFilters.status.optional(),
  includeIgnored: onDemandFilters.includeIgnored.optional(),
  order: onDemandFilters.order.optional(),
})
export const transferRows = rowsResponse(transferRow)

type Source = z.infer<typeof transactionSource> | null

/**
 * An Actual Transfer with a side from the bank or the old ledger keeps its amount and date, and
 * deleting it keeps it as an ignored line.
 */
export function isImportedTransfer(transfer: { fromSource: Source; toSource: Source }): boolean {
  return isImported({ source: transfer.fromSource }) || isImported({ source: transfer.toSource })
}

export type CreateTransfer = z.input<typeof createTransfer>
export type UpdateTransfer = z.infer<typeof updateTransfer>
export type TransferRow = z.infer<typeof transferRow>

// Reconcile: pairing an Actual with the Planned item it fulfils, one to one.

/**
 * Reconcile `actualId` (an Actual Transaction or Actual Transfer) to a Planned item: an
 * Occurrence, named by its Schedule and nominal date; a one-off Planned Transaction; or a one-off
 * Planned Transfer, each named by its id. An Actual Transaction Reconciled to a Planned Transfer
 * becomes an Actual Transfer, keyed on its Wallet's side.
 */
export const reconcile = z.discriminatedUnion("plannedKind", [
  z.strictObject({
    plannedKind: z.literal("occurrence"),
    plannedRef: z.strictObject({ scheduleId: id, nominalDate: isoDate }),
    actualId: id,
  }),
  z.strictObject({ plannedKind: z.literal("transaction"), plannedRef: id, actualId: id }),
  z.strictObject({ plannedKind: z.literal("transfer"), plannedRef: id, actualId: id }),
])

/** Un-Reconcile the Actual: its Planned item is outstanding again. */
export const unreconcile = z.strictObject({ actualId: id })

/** What a Reconcile or Un-Reconcile changed: rows to upsert, and the ids of rows deleted. */
export const reconcileResult = z.object({
  occurrences: z.array(occurrenceRow),
  deletedOccurrences: z.array(id),
  transactions: z.array(transactionRow),
  /** An Actual Transaction that became an Actual Transfer. */
  deletedTransactions: z.array(id),
  transfers: z.array(transferRow),
})

export type Reconcile = z.infer<typeof reconcile>
export type ReconcileResult = z.infer<typeof reconcileResult>

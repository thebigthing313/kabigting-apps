import { api } from "@/data/api"
import { readJson, reportError } from "@/data/error-handler"
import { markLinesReviewed, writeTransactions } from "@/data/finances-transactions"
import { writeWallet } from "@/data/finances-wallets"
import {
  datesAround,
  MATCH_WINDOW_DAYS,
  outstandingPlanned,
  reviewSuggestion,
} from "@shared/finances/reconcile"
import type { TransactionRow, UploadResult } from "@shared/finances/schemas"

/**
 * The server's answer: it needs a Wallet for the file's bank account, or it added the lines, and
 * `toReview` of them wait in To review.
 */
export type UploadOutcome =
  | Extract<UploadResult, { needsWallet: unknown }>
  | (Extract<UploadResult, { inserted: unknown }> & { toReview: number })

/**
 * Sends a statement file to the server, with the Wallet a person picked once it asked for one.
 * The lines it added and the Wallet it remembered are written into their collections. Lines with
 * nothing to suggest are marked reviewed as unplanned; the rest wait in To review. Resolves null
 * after a refusal, which is reported with a toast.
 */
export async function uploadStatement(
  file: File,
  walletId?: string,
): Promise<UploadOutcome | null> {
  let result: UploadResult
  try {
    result = await readJson(
      await api.finances.uploads.$post({
        form: walletId === undefined ? { file } : { file, walletId },
      }),
    )
  } catch (error) {
    reportError(error, "Uploading")
    return null
  }
  if (!("inserted" in result)) return result
  await writeTransactions(result.inserted)
  await writeWallet(result.wallet)
  const toReview = await sortForReview(result.wallet.id, result.inserted)
  return { ...result, toReview }
}

/**
 * Marks the new lines with no Planned match, no hand-entry twin and no Transfer they are the other
 * side of reviewed, so only those with a suggestion wait in To review. Returns how many wait. If
 * this fails, every new line waits, each still with Unplanned to clear it.
 */
async function sortForReview(walletId: string, lines: readonly TransactionRow[]): Promise<number> {
  // Every suggestion is dated within a week of its line.
  const range = datesAround(lines, MATCH_WINDOW_DAYS)
  if (range === null) return 0
  const inRange = { walletId, dateFrom: range.from, dateTo: range.to }
  try {
    const [schedules, occurrences, planned, plannedTransfers, actuals, transfers] =
      await Promise.all([
        api.finances.schedules.query.$post({ json: {} }).then(readJson),
        api.finances.occurrences.query.$post({ json: {} }).then(readJson),
        api.finances.transactions.query
          .$post({ json: { ...inRange, status: "planned" } })
          .then(readJson),
        api.finances.transfers.query
          .$post({ json: { ...inRange, status: "planned" } })
          .then(readJson),
        api.finances.transactions.query
          .$post({ json: { ...inRange, status: "actual" } })
          .then(readJson),
        api.finances.transfers.query
          .$post({ json: { ...inRange, status: "actual" } })
          .then(readJson),
      ])
    const outstanding = outstandingPlanned({
      walletId,
      schedules: schedules.rows,
      occurrences: occurrences.rows,
      planned: planned.rows,
      plannedTransfers: plannedTransfers.rows,
      range,
    })
    const candidates = { outstanding, handEntered: actuals.rows, transfers: transfers.rows }
    const unplanned = lines.filter((line) => reviewSuggestion(line, candidates) === null)
    if (unplanned.length > 0 && !(await markLinesReviewed(unplanned.map((line) => line.id)))) {
      return lines.length
    }
    return lines.length - unplanned.length
  } catch (error) {
    reportError(error, "Sorting the new lines")
    return lines.length
  }
}

import { ApiError } from "#server/core/errors.ts"
import { MAX_QUERY_IDS } from "#shared/schemas/query.ts"

/**
 * The row limit for a `/query`: the caller's, or one past the cap so `withinCap` can tell when a
 * query without one matches too many rows.
 */
export function queryLimit(limit: number | undefined): number {
  return limit ?? MAX_QUERY_IDS + 1
}

/**
 * A query without a limit answers with every matching row or is refused: cutting it short would
 * pass a partial set off as the whole.
 */
export function withinCap<Row>(rows: Row[], limit: number | undefined): Row[] {
  if (limit === undefined && rows.length > MAX_QUERY_IDS) {
    throw new ApiError(
      "validation_failed",
      `More than ${MAX_QUERY_IDS} rows match; ask for a page with limit`,
    )
  }
  return rows
}

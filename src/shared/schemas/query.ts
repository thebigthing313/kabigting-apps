/**
 * Reads are `POST .../query` with a body of the base fields plus per-resource filters; responses
 * are `{ rows }` so a cursor can be added later without breaking clients.
 */
import { z } from "zod"
import { id } from "./primitives.ts"

export const MAX_QUERY_IDS = 5000

const base = {
  ids: z.array(id).max(MAX_QUERY_IDS).optional(),
  limit: z.int().min(1).max(MAX_QUERY_IDS).optional(),
  after: id.optional(),
}

export function queryBody<Filters extends z.ZodRawShape>(filters: Filters) {
  return z.strictObject({ ...base, ...filters })
}

export function rowsResponse<Row extends z.ZodType>(row: Row) {
  return z.object({ rows: z.array(row) })
}

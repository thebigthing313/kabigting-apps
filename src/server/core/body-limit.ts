import { bodyLimit as honoBodyLimit } from "hono/body-limit"
import { ApiError } from "#server/core/errors.ts"

/** Enough for a 5,000-id query body (about 190 KB of JSON). */
export const MAX_BODY_BYTES = 300 * 1024

export const bodyLimit = honoBodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new ApiError("validation_failed", "Request body too large")
  },
})

import type { MiddlewareHandler } from "hono"
import { bodyLimit as honoBodyLimit } from "hono/body-limit"
import { ApiError } from "#server/core/errors.ts"

/** Enough for a 5,000-id query body (about 190 KB of JSON). */
export const MAX_BODY_BYTES = 300 * 1024

/** A file upload, such as a bank statement download, may be larger. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const jsonLimit = honoBodyLimit({
  maxSize: MAX_BODY_BYTES,
  onError: () => {
    throw new ApiError("validation_failed", "Request body too large")
  },
})

const uploadLimit = honoBodyLimit({
  maxSize: MAX_UPLOAD_BYTES,
  onError: () => {
    throw new ApiError("validation_failed", "The file is larger than 5 MB")
  },
})

/**
 * Bodies are JSON, held to the JSON limit, except multipart file uploads, which have their own.
 * Only upload routes read multipart bodies; every other route's validator refuses one unread.
 */
export const bodyLimit: MiddlewareHandler = (c, next) => {
  const multipart = c.req.header("content-type")?.toLowerCase().startsWith("multipart/form-data")
  return multipart ? uploadLimit(c, next) : jsonLimit(c, next)
}

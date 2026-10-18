import type { MiddlewareHandler } from "hono"
import { bodyLimit as honoBodyLimit } from "hono/body-limit"
import { ApiError } from "#server/core/errors.ts"

/** Enough for a 5,000-id query body (about 190 KB of JSON). */
export const MAX_BODY_BYTES = 300 * 1024

/** A file upload, such as a bank statement download, may be larger. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export const bodyLimit = honoBodyLimit({
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
 * The usual limit, except on the given upload routes (full request paths), which have their own.
 */
export function bodyLimitWithUploads(uploadPaths: ReadonlySet<string>): MiddlewareHandler {
  return (c, next) => (uploadPaths.has(c.req.path) ? uploadLimit(c, next) : bodyLimit(c, next))
}

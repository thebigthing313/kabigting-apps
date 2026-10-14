import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { API_ERROR_STATUS, type ApiErrorCode, type ApiErrorEnvelope } from "#shared/api-error.ts"

/** Throw from any route or middleware; `handleError` turns it into the error envelope. */
export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly details: unknown

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message)
    this.code = code
    this.details = details
  }
}

export function errorResponse(c: Context, code: ApiErrorCode, message: string, details?: unknown) {
  const body: ApiErrorEnvelope = {
    error: { code, message, ...(details === undefined ? {} : { details }) },
  }
  return c.json(body, API_ERROR_STATUS[code])
}

/** The one `app.onError`: known errors keep their code, anything else is `internal`. */
export function handleError(error: Error, c: Context) {
  if (error instanceof ApiError) return errorResponse(c, error.code, error.message, error.details)
  if (error instanceof HTTPException && error.status === 413) {
    return c.json(
      {
        error: { code: "validation_failed", message: "Request body too large" },
      } satisfies ApiErrorEnvelope,
      413,
    )
  }
  console.error(error)
  return errorResponse(c, "internal", "Something went wrong")
}

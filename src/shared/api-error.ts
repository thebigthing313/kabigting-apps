/** Error codes every API error carries, with the HTTP status each one maps to. */
export const API_ERROR_STATUS = {
  unauthenticated: 401,
  password_change_required: 403,
  forbidden_app: 403,
  forbidden_admin: 403,
  /**
   * A Note's Audience member tried what only its Creator may do, or its Creator tried to Leave,
   * which only an Audience member may do.
   */
  forbidden_creator: 403,
  validation_failed: 400,
  not_found: 404,
  conflict: 409,
  internal: 500,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS

/** Body of every error response. `details` carries per-field issues for `validation_failed`. */
export type ApiErrorEnvelope = {
  error: { code: ApiErrorCode; message: string; details?: unknown }
}

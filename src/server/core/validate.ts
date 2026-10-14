import { zValidator } from "@hono/zod-validator"
import type { ValidationTargets } from "hono"
import type { z } from "zod"
import { ApiError } from "#server/core/errors.ts"

/** Zod validation that fails with a `validation_failed` envelope listing each issue. */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))
      throw new ApiError("validation_failed", "The request is not valid", details)
    }
  })
}

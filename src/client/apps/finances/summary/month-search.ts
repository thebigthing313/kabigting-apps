import { z } from "zod"

/** `?month=YYYY-MM`; a malformed month falls back to the opening month rather than failing. */
export const monthSearch = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .catch(undefined),
})

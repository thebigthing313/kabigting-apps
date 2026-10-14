/** Wire primitives every App schema builds on. */
import { z } from "zod"

/** Integer US cents, signed (money out is negative). */
export const cents = z.int()

/** Calendar date, `YYYY-MM-DD`, no zone. */
export const isoDate = z.iso.date()

/** Moment in time, ISO-8601 in UTC (`Z`). */
export const instant = z.iso.datetime()

/** Row id (the client makes UUIDv7s). */
export const id = z.uuid()

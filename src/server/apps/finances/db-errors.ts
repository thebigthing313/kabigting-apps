// Postgres constraint failures, recognised whether or not Drizzle has wrapped the driver's error.
import { DatabaseError } from "pg"
import { DrizzleQueryError } from "drizzle-orm/errors"

function databaseError(error: unknown): DatabaseError | undefined {
  const cause = error instanceof DrizzleQueryError ? error.cause : error
  return cause instanceof DatabaseError ? cause : undefined
}

/** A unique constraint refused the write, such as a taken name. */
export function isUniqueViolation(error: unknown): boolean {
  return databaseError(error)?.code === "23505"
}

/** The name of the check constraint that refused the write, if one did. */
export function violatedCheck(error: unknown): string | undefined {
  const cause = databaseError(error)
  return cause?.code === "23514" ? cause.constraint : undefined
}

/** A foreign key refused the write, such as deleting a row something still references. */
export function isForeignKeyViolation(error: unknown): boolean {
  return databaseError(error)?.code === "23503"
}

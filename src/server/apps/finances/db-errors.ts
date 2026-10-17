// Postgres constraint failures, recognised whether or not Drizzle has wrapped the driver's error.
import { DatabaseError } from "pg"
import { DrizzleQueryError } from "drizzle-orm/errors"

function postgresCode(error: unknown): string | undefined {
  const cause = error instanceof DrizzleQueryError ? error.cause : error
  return cause instanceof DatabaseError ? cause.code : undefined
}

/** A unique constraint refused the write, such as a taken name. */
export function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === "23505"
}

/** A foreign key refused the write, such as deleting a row something still references. */
export function isForeignKeyViolation(error: unknown): boolean {
  return postgresCode(error) === "23503"
}

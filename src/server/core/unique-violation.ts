/**
 * True when a database write failed on the named unique constraint. Drizzle wraps the driver's
 * error, so the Postgres code is looked for on the error and its causes.
 */
export function uniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error
  while (typeof current === "object" && current !== null) {
    if (
      "code" in current &&
      current.code === "23505" &&
      "constraint" in current &&
      current.constraint === constraint
    ) {
      return true
    }
    current = "cause" in current ? current.cause : undefined
  }
  return false
}

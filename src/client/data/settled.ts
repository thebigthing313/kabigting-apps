import { isUnreached } from "@/data/error-handler"

/** An optimistic write, until the server accepts or refuses it. */
export type Settling = { when: (state: "settled") => Promise<unknown> }

/** True once the server accepted the write; false after a rollback (already reported). */
export async function settled(transaction: Settling): Promise<boolean> {
  try {
    await transaction.when("settled")
    return true
  } catch {
    return false
  }
}

/**
 * How a write ended: stored; refused by the server (rolled back and reported); or unreached,
 * because the network or a gateway in front of the server failed, so trying again may work.
 */
export type WriteOutcome = "saved" | "refused" | "unreached"

/**
 * How a write ended, for a caller that tells failures apart itself: null once the server accepted
 * it, otherwise what it failed with (rolled back by then).
 */
export async function writeFailure(transaction: Settling): Promise<{ error: unknown } | null> {
  try {
    await transaction.when("settled")
    return null
  } catch (error) {
    return { error }
  }
}

/** As `settled`, telling a write that never reached the server from one that was refused. */
export async function writeOutcome(transaction: Settling): Promise<WriteOutcome> {
  const failed = await writeFailure(transaction)
  if (!failed) return "saved"
  return isUnreached(failed.error) ? "unreached" : "refused"
}

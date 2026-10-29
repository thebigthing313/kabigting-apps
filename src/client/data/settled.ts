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

/** As `settled`, telling a write that never reached the server from one that was refused. */
export async function writeOutcome(transaction: Settling): Promise<WriteOutcome> {
  try {
    await transaction.when("settled")
    return "saved"
  } catch (error) {
    return isUnreached(error) ? "unreached" : "refused"
  }
}

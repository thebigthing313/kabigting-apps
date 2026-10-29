import { isNetworkError } from "@/data/error-handler"

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
 * How a save of typed text ended: stored; refused by the server (rolled back and reported); or
 * unreached, because the network failed, which its field shows as "Not saved" and retries.
 */
export type SaveOutcome = "saved" | "refused" | "unreached"

/** How a save of typed text is sent. */
export type SaveOptions = {
  /** Send it with `keepalive`, so it outlives a page that is closing. */
  keepalive: boolean
}

/** As `settled`, telling a save that never reached the server from one that was refused. */
export async function saveOutcome(transaction: Settling): Promise<SaveOutcome> {
  try {
    await transaction.when("settled")
    return "saved"
  } catch (error) {
    return isNetworkError(error) ? "unreached" : "refused"
  }
}

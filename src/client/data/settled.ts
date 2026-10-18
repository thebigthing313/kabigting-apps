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

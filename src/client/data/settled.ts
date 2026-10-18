/** True once the server accepted the write; false after a rollback (already reported). */
export async function settled(transaction: {
  when: (state: "settled") => Promise<unknown>
}): Promise<boolean> {
  try {
    await transaction.when("settled")
    return true
  } catch {
    return false
  }
}

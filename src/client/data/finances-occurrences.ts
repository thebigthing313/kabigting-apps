import { useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { nowInstant } from "@shared/dates"
import type { OccurrenceOverride } from "@shared/finances/occurrences"
import type { OccurrenceRow, UpdateOccurrence } from "@shared/finances/schemas"
import { newId } from "@shared/ids"

function editable(changes: Partial<OccurrenceRow>): UpdateOccurrence {
  const { overrideAmountCents, overrideDate, skipped } = changes
  return {
    ...(overrideAmountCents === undefined ? {} : { overrideAmountCents }),
    ...(overrideDate === undefined ? {} : { overrideDate }),
    ...(skipped === undefined ? {} : { skipped }),
  }
}

const financesOccurrences = defineRestCollection<OccurrenceRow>({
  id: "finances-occurrences",
  queryKey: ["finances", "occurrences"],
  fetchRows: async () =>
    (await readJson(await api.finances.occurrences.query.$post({ json: {} }))).rows,
  create: async ({ id, scheduleId, nominalDate, overrideAmountCents, overrideDate, skipped }) =>
    readJson(
      await api.finances.occurrences.$post({
        json: { id, scheduleId, nominalDate, overrideAmountCents, overrideDate, skipped },
      }),
    ),
  update: async (id, changes) =>
    readJson(
      await api.finances.occurrences[":id"].$patch({ param: { id }, json: editable(changes) }),
    ),
  remove: async (id) => readJson(await api.finances.occurrences[":id"].$delete({ param: { id } })),
})

/** Every stored Occurrence (overridden, skipped or Reconciled), live. */
export function useStoredOccurrences() {
  const occurrences = financesOccurrences()
  return useLiveQuery((q) => q.from({ occurrence: occurrences }), [occurrences])
}

/** True once the server accepted the write; false after a rollback (already reported). */
async function settled(transaction: { when: (state: "settled") => Promise<unknown> }) {
  try {
    await transaction.when("settled")
    return true
  } catch {
    return false
  }
}

/**
 * Stores what a person changed on one Occurrence, shown at once. `override` null puts it back on
 * its Schedule's terms, deleting the stored row; `stored` is that row, if there is one.
 */
export async function saveOccurrence(
  occurrence: { scheduleId: string; nominalDate: string; stored: OccurrenceRow | undefined },
  override: OccurrenceOverride | null,
): Promise<boolean> {
  const collection = financesOccurrences()
  const { stored } = occurrence
  if (override === null) {
    return stored ? settled(collection.delete(stored.id)) : true
  }
  if (stored) {
    return settled(
      collection.update(stored.id, (draft) => {
        Object.assign(draft, override)
      }),
    )
  }
  const now = nowInstant()
  return settled(
    collection.insert({
      id: newId(),
      scheduleId: occurrence.scheduleId,
      nominalDate: occurrence.nominalDate,
      ...override,
      reconciledTransactionId: null,
      reconciledTransferId: null,
      createdAt: now,
      updatedAt: now,
    }),
  )
}

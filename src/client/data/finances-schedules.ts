import { useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson, reportError } from "@/data/error-handler"
import { applyOccurrenceChanges, forgetOccurrencesOf } from "@/data/finances-occurrences"
import { nowInstant } from "@shared/dates"
import type {
  ChangeScheduleFrom,
  ScheduleCommandResult,
  ScheduleRow,
  UpdateSchedule,
} from "@shared/finances/schemas"
import { newId } from "@shared/ids"

export type Schedule = ScheduleRow

/** What a person enters for a new Schedule. */
export type NewSchedule = Pick<
  ScheduleRow,
  | "walletId"
  | "toWalletId"
  | "accountId"
  | "amountCents"
  | "unit"
  | "every"
  | "startDate"
  | "endDate"
  | "categoryId"
  | "note"
>

function editable(changes: Partial<ScheduleRow>): UpdateSchedule {
  const { accountId, categoryId, note, endDate } = changes
  return {
    ...(accountId === undefined ? {} : { accountId }),
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(note === undefined ? {} : { note }),
    // Only Reopen changes the end date in place; End is a command.
    ...(endDate === null ? { endDate } : {}),
  }
}

const financesSchedules = defineRestCollection<ScheduleRow>({
  id: "finances-schedules",
  queryKey: ["finances", "schedules"],
  fetchRows: async () =>
    (await readJson(await api.finances.schedules.query.$post({ json: {} }))).rows,
  create: async (row) => {
    const { predecessorId: _predecessor, createdAt: _created, updatedAt: _updated, ...input } = row
    return readJson(await api.finances.schedules.$post({ json: input }))
  },
  update: async (id, changes) =>
    readJson(
      await api.finances.schedules[":id"].$patch({ param: { id }, json: editable(changes) }),
    ),
  remove: async (id) => readJson(await api.finances.schedules[":id"].$delete({ param: { id } })),
})

/** Every Schedule, live. */
export function useSchedules() {
  const schedules = financesSchedules()
  return useLiveQuery((q) => q.from({ schedule: schedules }), [schedules])
}

/** Writes Schedules another command changed, such as a Category merge, into the collection. */
export async function writeSchedules(rows: readonly ScheduleRow[]): Promise<void> {
  if (rows.length > 0) await financesSchedules().utils.writeUpsert([...rows])
}

/** Writes a command's changed rows into the collections it touched. */
async function apply(result: ScheduleCommandResult): Promise<void> {
  if (result.schedules.length > 0) await financesSchedules().utils.writeUpsert(result.schedules)
  await applyOccurrenceChanges(result.occurrences, result.deletedOccurrences)
}

/** Runs a command on the server; false after a refusal, which is reported with a toast. */
async function command(run: () => Promise<ScheduleCommandResult>): Promise<boolean> {
  let result: ScheduleCommandResult
  try {
    result = await run()
  } catch (error) {
    reportError(error, "Saving")
    return false
  }
  await apply(result)
  return true
}

/**
 * Changes the Schedule's terms from `date`: it ends the day before, and a successor carries the
 * new terms. Later overrides move to the successor.
 */
export function changeScheduleFrom(scheduleId: string, body: ChangeScheduleFrom) {
  return command(async () =>
    readJson(
      await api.finances.schedules[":id"]["change-from"].$post({
        param: { id: scheduleId },
        json: body,
      }),
    ),
  )
}

/** Ends the Schedule on `endDate`, deleting the later overrides the person was shown. */
export function endSchedule(scheduleId: string, endDate: string, overrideIds: readonly string[]) {
  return command(async () =>
    readJson(
      await api.finances.schedules[":id"].end.$post({
        param: { id: scheduleId },
        json: { endDate, confirmDeleteOverrides: [...overrideIds] },
      }),
    ),
  )
}

/** Clears the end date, shown at once; false after a refusal rolled it back. */
export async function reopenSchedule(scheduleId: string): Promise<boolean> {
  const transaction = financesSchedules().update(scheduleId, (draft) => {
    draft.endDate = null
  })
  try {
    await transaction.when("settled")
    return true
  } catch {
    return false
  }
}

/** Deletes a whole chain (any of its ids will do) with its stored Occurrences. */
export async function deleteScheduleChain(chainIds: readonly string[]): Promise<boolean> {
  const [anyId] = chainIds
  if (anyId === undefined) return true
  try {
    await readJson(await api.finances.schedules[":id"].$delete({ param: { id: anyId } }))
  } catch (error) {
    reportError(error, "Deleting")
    return false
  }
  const collection = financesSchedules()
  await forgetOccurrencesOf(chainIds)
  await collection.utils.writeDelete(chainIds.filter((id) => collection.has(id)))
  return true
}

/** Shows the Schedule at once; resolves false after a refusal rolled it back (with a toast). */
export async function addSchedule(input: NewSchedule): Promise<boolean> {
  const now = nowInstant()
  const transaction = financesSchedules().insert({
    id: newId(),
    ...input,
    predecessorId: null,
    createdAt: now,
    updatedAt: now,
  })
  try {
    await transaction.when("settled")
    return true
  } catch {
    return false
  }
}

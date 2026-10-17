import { eq, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { nowInstant } from "@shared/dates"
import type { ScheduleRow, UpdateSchedule } from "@shared/finances/schemas"
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
  const { accountId, categoryId, note } = changes
  return {
    ...(accountId === undefined ? {} : { accountId }),
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(note === undefined ? {} : { note }),
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

/** One Schedule, live; `schedule` is undefined while loading or when there is no such Schedule. */
export function useSchedule(id: string) {
  const schedules = financesSchedules()
  const { data, isLoading } = useLiveQuery(
    (q) => q.from({ schedule: schedules }).where(({ schedule }) => eq(schedule.id, id)),
    [schedules, id],
  )
  return { schedule: data[0], isLoading }
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

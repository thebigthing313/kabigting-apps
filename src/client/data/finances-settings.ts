import { useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { SETTINGS_ID, type SettingsRow, type UpdateSettings } from "@shared/finances/schemas"

function editable(changes: Partial<SettingsRow>): UpdateSettings {
  const { openOnHomeWalletId } = changes
  return openOnHomeWalletId === undefined ? {} : { openOnHomeWalletId }
}

function seeded(): never {
  throw new Error("The household's settings row is seeded; it is never added or removed")
}

const financesSettings = defineRestCollection<SettingsRow>({
  id: "finances-settings",
  queryKey: ["finances", "settings"],
  fetchRows: async () =>
    (await readJson(await api.finances.settings.query.$post({ json: {} }))).rows,
  create: async () => seeded(),
  update: async (id, changes) =>
    readJson(await api.finances.settings[":id"].$patch({ param: { id }, json: editable(changes) })),
  remove: async () => seeded(),
})

/**
 * The forecast Wallet home opens on, shared by the household; null means All. `isLoading` is true
 * until the row has arrived.
 */
export function useOpenOnHome() {
  const settings = financesSettings()
  const { data, isLoading } = useLiveQuery((q) => q.from({ settings }), [settings])
  return { walletId: data[0]?.openOnHomeWalletId ?? null, isLoading }
}

/** Opens home on this forecast Wallet, or on All for null; shown at once, rolled back if refused. */
export async function setOpenOnHome(walletId: string | null): Promise<boolean> {
  const transaction = financesSettings().update(SETTINGS_ID, (draft) => {
    draft.openOnHomeWalletId = walletId
  })
  try {
    await transaction.when("settled")
    return true
  } catch {
    return false
  }
}

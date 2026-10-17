import { eq, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineRestCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { nowInstant } from "@shared/dates"
import type { UpdateWallet, WalletRow } from "@shared/finances/schemas"
import { newId } from "@shared/ids"

export type Wallet = WalletRow

/** The settings a person types: on a new Wallet, and on a Wallet's Settings tab. */
export type WalletSettings = Pick<
  WalletRow,
  "name" | "inForecast" | "lowBalanceThresholdCents" | "shownAsOwed"
>

export type WalletChanges = Partial<WalletSettings> & {
  archived?: boolean
  /** Only null: "Forget" the bank account an upload remembered. */
  bankAccountLast4?: null
}

function editable(changes: Partial<WalletRow>): UpdateWallet {
  const { name, inForecast, lowBalanceThresholdCents, shownAsOwed, archived, bankAccountLast4 } =
    changes
  return {
    ...(name === undefined ? {} : { name }),
    ...(inForecast === undefined ? {} : { inForecast }),
    ...(lowBalanceThresholdCents === undefined ? {} : { lowBalanceThresholdCents }),
    ...(shownAsOwed === undefined ? {} : { shownAsOwed }),
    ...(archived === undefined ? {} : { archived }),
    ...(bankAccountLast4 === null ? { bankAccountLast4 } : {}),
  }
}

const financesWallets = defineRestCollection<WalletRow>({
  id: "finances-wallets",
  queryKey: ["finances", "wallets"],
  fetchRows: async () =>
    (await readJson(await api.finances.wallets.query.$post({ json: {} }))).rows,
  create: async ({ id, name, inForecast, lowBalanceThresholdCents, shownAsOwed }) =>
    readJson(
      await api.finances.wallets.$post({
        json: { id, name, inForecast, lowBalanceThresholdCents, shownAsOwed },
      }),
    ),
  update: async (id, changes) =>
    readJson(await api.finances.wallets[":id"].$patch({ param: { id }, json: editable(changes) })),
  remove: async (id) => readJson(await api.finances.wallets[":id"].$delete({ param: { id } })),
})

/** Every household Wallet, archived ones included, by name, live. */
export function useWallets() {
  const wallets = financesWallets()
  return useLiveQuery(
    (q) => q.from({ wallet: wallets }).orderBy(({ wallet }) => wallet.name, "asc"),
    [wallets],
  )
}

/** One Wallet, live; `wallet` is undefined while loading or when there is no such Wallet. */
export function useWallet(id: string) {
  const wallets = financesWallets()
  const { data, isLoading } = useLiveQuery(
    (q) => q.from({ wallet: wallets }).where(({ wallet }) => eq(wallet.id, id)),
    [wallets, id],
  )
  return { wallet: data[0], isLoading }
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

/** Shows the Wallet at once; rolls it back with a toast if the server refuses it. */
export function addWallet(settings: WalletSettings): Promise<boolean> {
  const now = nowInstant()
  return settled(
    financesWallets().insert({
      id: newId(),
      ...settings,
      bankAccountLast4: null,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }),
  )
}

export function editWallet(id: string, changes: WalletChanges): Promise<boolean> {
  return settled(
    financesWallets().update(id, (draft) => {
      Object.assign(draft, changes)
    }),
  )
}

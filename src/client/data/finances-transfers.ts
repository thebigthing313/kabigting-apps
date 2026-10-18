import { and, eq, gt, inArray, or, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineOnDemandCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { settled } from "@/data/settled"
import { nowInstant } from "@shared/dates"
import type { TransferRow, UpdateTransfer } from "@shared/finances/schemas"
import { newId } from "@shared/ids"

export type Transfer = TransferRow

/** What a person enters for a one-off Planned Transfer or an Actual Transfer. */
export type NewTransfer = Pick<
  TransferRow,
  "status" | "fromWalletId" | "toWalletId" | "date" | "amountCents" | "accountId" | "note"
>

/** What a person may change; a side from the bank keeps its Wallet, the amount and the date. */
export type TransferChanges = Partial<Omit<NewTransfer, "status">>

function editable(changes: Partial<TransferRow>): UpdateTransfer {
  const { fromWalletId, toWalletId, date, amountCents, accountId, note } = changes
  return {
    ...(fromWalletId === undefined ? {} : { fromWalletId }),
    ...(toWalletId === undefined ? {} : { toWalletId }),
    ...(date === undefined ? {} : { date }),
    ...(amountCents === undefined ? {} : { amountCents }),
    ...(accountId === undefined ? {} : { accountId }),
    ...(note === undefined ? {} : { note }),
  }
}

/**
 * One-off Planned and Actual Transfers share one collection and load on demand, a Wallet's
 * Transfers being those out of it and into it. They stay fresh for five minutes.
 */
const financesTransfers = defineOnDemandCollection<TransferRow>({
  id: "finances-transfers",
  queryKey: ["finances", "transfers"],
  staleTime: 5 * 60_000,
  fetchRows: async (query) =>
    (await readJson(await api.finances.transfers.query.$post({ json: query }))).rows,
  create: async ({ id, status, fromWalletId, toWalletId, date, amountCents, accountId, note }) =>
    readJson(
      await api.finances.transfers.$post({
        json: { id, status, fromWalletId, toWalletId, date, amountCents, accountId, note },
      }),
    ),
  update: async (id, changes) =>
    readJson(
      await api.finances.transfers[":id"].$patch({ param: { id }, json: editable(changes) }),
    ),
  remove: async (id) => readJson(await api.finances.transfers[":id"].$delete({ param: { id } })),
})

/** Dates are `YYYY-MM-DD`, so plain string order is date order and can page. */
const NEWEST_FIRST = { direction: "desc", stringSort: "lexical" } as const
const OLDEST_FIRST = { direction: "asc", stringSort: "lexical" } as const

/** Out of or into the Wallet; the server's `walletId` filter on Transfers. */
function touches(row: { fromWalletId: unknown; toWalletId: unknown }, walletId: string) {
  return or(eq(row.fromWalletId, walletId), eq(row.toWalletId, walletId))
}

/**
 * A Wallet's Actual Transfers dated after `after`, out of it or into it. Nothing loads while
 * `after` is undefined.
 */
export function useActualTransfersSince(walletId: string, after: string | undefined) {
  const transfers = financesTransfers()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      after === undefined
        ? undefined
        : q
            .from({ row: transfers })
            .where(({ row }) =>
              and(touches(row, walletId), eq(row.status, "actual"), gt(row.date, after)),
            ),
    [transfers, walletId, after],
  )
  return { transfers: data ?? [], isLoading: after !== undefined && isLoading }
}

/**
 * A Wallet's one-off Planned Transfers, out of it or into it, soonest first. `plannedTransfers`
 * are the outstanding ones; a Reconciled one is no longer outstanding, and `planned` keeps those
 * too, to show what an Actual Transfer is Reconciled to.
 */
export function useOutstandingPlannedTransfers(walletId: string) {
  const transfers = financesTransfers()
  const { data, isLoading } = useLiveQuery(
    (q) =>
      q
        .from({ row: transfers })
        .where(({ row }) => and(touches(row, walletId), eq(row.status, "planned")))
        .orderBy(({ row }) => row.date, OLDEST_FIRST),
    [transfers, walletId],
  )
  // Few enough to filter here; the server has no filter for the Reconcile link.
  return {
    plannedTransfers: data.filter((row) => row.reconciledActualId === null),
    planned: data,
    isLoading,
  }
}

/** The Transfers with these ids, such as the Actuals Transfer Occurrences are Reconciled to. */
export function useTransfersById(ids: readonly string[]) {
  const transfers = financesTransfers()
  const key = ids.toSorted().join(",")
  const { data } = useLiveQuery(
    (q) =>
      key === ""
        ? undefined
        : q.from({ row: transfers }).where(({ row }) => inArray(row.id, key.split(","))),
    [transfers, key],
  )
  return new Map((data ?? []).map((row) => [row.id, row]))
}

/** Writes Transfers a command changed on the server into the collection. */
export async function writeTransfers(rows: readonly TransferRow[]): Promise<void> {
  if (rows.length > 0) await financesTransfers().utils.writeUpsert([...rows])
}

/**
 * A Wallet's Actual Transfers, newest first: the `count` newest, plus one more when there are
 * older ones. Raising `count` loads the next page.
 */
export function useTransferActivity(walletId: string, count: number) {
  const transfers = financesTransfers()
  return useLiveQuery(
    (q) =>
      q
        .from({ row: transfers })
        .where(({ row }) => and(touches(row, walletId), eq(row.status, "actual")))
        .orderBy(({ row }) => row.date, NEWEST_FIRST)
        .limit(count + 1),
    [transfers, walletId, count],
  )
}

/** Shows the Transfer at once; resolves false after a refusal rolled it back (with a toast). */
export function addTransfer(input: NewTransfer): Promise<boolean> {
  const now = nowInstant()
  // A hand-entered Actual Transfer came from a person on both sides.
  const source = input.status === "actual" ? "manual" : null
  return settled(
    financesTransfers().insert({
      id: newId(),
      ...input,
      fromSource: source,
      fromBankDescription: null,
      toSource: source,
      toBankDescription: null,
      ignored: false,
      reconciledActualId: null,
      createdAt: now,
      updatedAt: now,
    }),
  )
}

export function editTransfer(id: string, changes: TransferChanges): Promise<boolean> {
  return settled(
    financesTransfers().update(id, (draft) => {
      Object.assign(draft, changes)
    }),
  )
}

/** Deletes a hand-entered Transfer; an imported one is kept by the server as an ignored line. */
export function deleteTransfer(id: string): Promise<boolean> {
  return settled(financesTransfers().delete(id))
}

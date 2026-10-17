import { and, eq, lt, useLiveQuery } from "@tanstack/react-db"
import { api } from "@/data/api"
import { defineOnDemandCollection } from "@/data/collection-factory"
import { readJson } from "@/data/error-handler"
import { nowInstant } from "@shared/dates"
import type { BalanceCheckRow, UpdateBalanceCheck } from "@shared/finances/schemas"
import { newId } from "@shared/ids"

export type BalanceCheck = BalanceCheckRow

/**
 * The Actuals a balance is computed with. Hand entry and upload arrive in later slices; until
 * then there are none, so a balance is its latest check and a check's computed balance is the
 * check before it.
 */
export const NO_ACTUALS_YET: readonly { date: string; amountCents: number }[] = []

function editable({ date, amountCents }: Partial<BalanceCheckRow>): UpdateBalanceCheck {
  return {
    ...(date === undefined ? {} : { date }),
    ...(amountCents === undefined ? {} : { amountCents }),
  }
}

/** Balance checks load on demand: only the Wallets, dates and pages on screen are fetched. */
const financesBalanceChecks = defineOnDemandCollection<BalanceCheckRow>({
  id: "finances-balance-checks",
  queryKey: ["finances", "balance-checks"],
  fetchRows: async (query) =>
    (await readJson(await api.finances["balance-checks"].query.$post({ json: query }))).rows,
  create: async ({ id, walletId, date, amountCents }) =>
    readJson(
      await api.finances["balance-checks"].$post({ json: { id, walletId, date, amountCents } }),
    ),
  update: async (id, changes) =>
    readJson(
      await api.finances["balance-checks"][":id"].$patch({
        param: { id },
        json: editable(changes),
      }),
    ),
  remove: async (id) =>
    readJson(await api.finances["balance-checks"][":id"].$delete({ param: { id } })),
})

/** Dates are `YYYY-MM-DD`, so plain string order is date order and can page. */
const NEWEST_FIRST = { direction: "desc", stringSort: "lexical" } as const

/** A Wallet's newest `count` checks, only those before `before` when given. */
function useNewestChecks(walletId: string, count: number, before?: string) {
  const checks = financesBalanceChecks()
  return useLiveQuery(
    (q) =>
      q
        .from({ check: checks })
        .where(({ check }) =>
          before === undefined
            ? eq(check.walletId, walletId)
            : and(eq(check.walletId, walletId), lt(check.date, before)),
        )
        .orderBy(({ check }) => check.date, NEWEST_FIRST)
        .limit(count),
    [checks, walletId, count, before],
  )
}

/**
 * A Wallet's checks, newest first: the `count` newest, plus the one before them so each shown
 * check can be compared with its previous. Raising `count` loads the next page.
 */
export function useBalanceChecks(walletId: string, count: number) {
  return useNewestChecks(walletId, count + 1)
}

/** A Wallet's latest check, the starting point of its balance; undefined when it has none. */
export function useLatestBalanceCheck(walletId: string) {
  const { data, isLoading } = useNewestChecks(walletId, 1)
  return { check: data[0], isLoading }
}

/** The Wallet's check before `date`, the one a check on `date` is compared with. */
export function usePreviousBalanceCheck(walletId: string, date: string) {
  const { data, isLoading } = useNewestChecks(walletId, 1, date)
  return { check: data[0], isLoading }
}

/**
 * Enters a check. A check already on that date is replaced by the server, which keeps the
 * first one's id. Resolves true once stored; false after a rollback (already reported).
 */
export async function enterBalanceCheck(
  check: Pick<BalanceCheckRow, "walletId" | "date" | "amountCents">,
): Promise<boolean> {
  const now = nowInstant()
  try {
    await financesBalanceChecks()
      .insert({ id: newId(), ...check, createdAt: now, updatedAt: now })
      .when("settled")
    return true
  } catch {
    return false
  }
}

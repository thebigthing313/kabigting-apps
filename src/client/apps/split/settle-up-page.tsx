import { getRouteApi } from "@tanstack/react-router"
import { useState } from "react"
import { z } from "zod"
import { useEntryForm } from "@/apps/split/entry-form"
import { PaymentForm } from "@/apps/split/payment-form"
import { Skeleton } from "@/components/ui/skeleton"
import { addPayment, type Member, useExpenses, useMembers, usePayments } from "@/data/split"
import { today } from "@shared/dates"
import { newId } from "@shared/ids"
import {
  householdBalances,
  newPaymentAllowed,
  paymentProblems,
  type SuggestedPayment,
  withBalances,
} from "@shared/split/rules"

const appRoute = getRouteApi("/_app")
const newRoute = getRouteApi("/_app/split/payments/new")

/**
 * Settle up's address: a suggested Payment, from the Balances tab, to fill the form in with. Each
 * part that isn't the right shape is dropped.
 */
export const settleUpSearch = z.object({
  fromId: z.string().optional().catch(undefined),
  toId: z.string().optional().catch(undefined),
  amount: z.number().optional().catch(undefined),
})

/**
 * The suggested Payment in Settle up's address, when it is one that could be recorded: between two
 * different Members or Former members, for an Amount above zero. Otherwise none, and the form
 * starts empty as usual.
 */
function suggestionIn(
  search: z.infer<typeof settleUpSearch>,
  accounts: readonly Member[],
  on: string,
): SuggestedPayment | undefined {
  const { fromId, toId, amount } = search
  if (fromId === undefined || toId === undefined || amount === undefined) return undefined
  const suggestion = { fromId, toId, amount }
  const problems = paymentProblems({ ...suggestion, date: on }, newPaymentAllowed(accounts))
  return problems.length === 0 ? suggestion : undefined
}

/**
 * Recording a Payment, full page, filled in when it opens from a suggestion. Its id is made once,
 * when the page opens, so trying a save again never stores it twice; the draft lives only here,
 * for as long as the page is open.
 */
export function SettleUpPage() {
  const { session } = appRoute.useRouteContext()
  const search = newRoute.useSearch()
  const { data: expenses, isLoading } = useExpenses()
  const { data: payments, isLoading: paymentsLoading } = usePayments()
  const members = useMembers()
  const entry = useEntryForm("Payment")
  const [id] = useState(newId)
  const [startedOn] = useState(today)
  if (isLoading || paymentsLoading || !members.data) {
    return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  }
  const accounts = members.data
  return (
    <PaymentForm
      viewerId={session.user.id}
      members={members.data}
      balances={householdBalances(
        expenses,
        payments,
        withBalances(members.data).map((member) => member.id),
      )}
      today={startedOn}
      suggested={suggestionIn(search, accounts, startedOn)}
      notice={entry.notice}
      onCancel={entry.leave}
      onSave={(payment) =>
        entry.save(() => addPayment({ id, ...payment }, session.user.id, accounts))
      }
    />
  )
}

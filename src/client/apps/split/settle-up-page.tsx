import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { PaymentForm } from "@/apps/split/payment-form"
import { Skeleton } from "@/components/ui/skeleton"
import { addPayment, useExpenses, useMembers, usePayments } from "@/data/split"
import { today } from "@shared/dates"
import { newId } from "@shared/ids"
import { householdBalances } from "@shared/split/rules"

const appRoute = getRouteApi("/_app")

/**
 * Recording a Payment, full page. Its id is made once, when the page opens, and the draft lives
 * only here, for as long as the page is open.
 */
export function SettleUpPage() {
  const { session } = appRoute.useRouteContext()
  const { data: expenses, isLoading } = useExpenses()
  const { data: payments, isLoading: paymentsLoading } = usePayments()
  const members = useMembers()
  const navigate = useNavigate()
  const [id] = useState(newId)
  const [startedOn] = useState(today)
  if (isLoading || paymentsLoading || !members.data) {
    return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  }
  const memberIds = members.data.map((member) => member.id)
  const home = () => void navigate({ to: "/split" })
  return (
    <PaymentForm
      viewerId={session.user.id}
      members={members.data}
      balances={householdBalances(expenses, payments, memberIds)}
      today={startedOn}
      onCancel={home}
      onSave={async (payment) => {
        const stored = await addPayment({ id, ...payment }, session.user.id, memberIds)
        if (stored) home()
        return stored
      }}
    />
  )
}

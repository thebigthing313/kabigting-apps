import { getRouteApi } from "@tanstack/react-router"
import { DeletedEntry, useEntryForm } from "@/apps/split/entry-form"
import { PaymentForm } from "@/apps/split/payment-form"
import { Skeleton } from "@/components/ui/skeleton"
import { changePayment, deletePayment, useExpenses, useMembers, usePayments } from "@/data/split"
import { today } from "@shared/dates"
import { householdBalances } from "@shared/split/rules"

const appRoute = getRouteApi("/_app")

/**
 * Changing a saved Payment, full page: any Member can change or delete any Payment. The draft
 * lives only here, for as long as the page is open.
 */
export function EditPaymentPage({ paymentId }: { paymentId: string }) {
  const { session } = appRoute.useRouteContext()
  const { data: expenses, isLoading } = useExpenses()
  const { data: payments, isLoading: paymentsLoading } = usePayments()
  const members = useMembers()
  const payment = payments.find((each) => each.id === paymentId)
  const entry = useEntryForm("Payment", { id: paymentId, row: payment, loaded: !paymentsLoading })
  if (isLoading || paymentsLoading || !members.data) {
    return <Skeleton className="mx-auto h-64 w-full max-w-md" />
  }
  if (!payment) return <DeletedEntry kind="Payment" onBack={entry.leave} />
  const memberIds = members.data.map((member) => member.id)
  return (
    <PaymentForm
      key={entry.formKey}
      viewerId={session.user.id}
      members={members.data}
      balances={householdBalances(expenses, payments, memberIds)}
      today={today()}
      notice={entry.notice}
      onCancel={entry.leave}
      onSave={(changed) =>
        entry.save(() => changePayment(payment, changed, session.user.id, memberIds))
      }
      editing={{
        payment,
        // It goes at once, and so do its effects on the Balances.
        onDelete: () => entry.remove(() => deletePayment(payment.id)),
      }}
    />
  )
}

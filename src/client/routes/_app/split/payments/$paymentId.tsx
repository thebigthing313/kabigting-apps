import { createFileRoute } from "@tanstack/react-router"
import { EditPaymentPage } from "@/apps/split/edit-payment-page"

export const Route = createFileRoute("/_app/split/payments/$paymentId")({
  component: EditPaymentRoute,
})

function EditPaymentRoute() {
  const { paymentId } = Route.useParams()
  return <EditPaymentPage paymentId={paymentId} />
}

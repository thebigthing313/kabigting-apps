import { authorshipWords, type People } from "@/apps/split/words"
import type { Payment } from "@/data/split"
import { formatDisplayDate } from "@shared/dates"
import { format } from "@shared/money"
import { effectOn, paymentEntry } from "@shared/split/rules"

/**
 * A Payment in the Activity feed: "From → To", the Amount, the date and any note, its effect on
 * the viewer's Balance, and who added and changed it. The whole card opens it.
 */
export function PaymentCard({
  payment,
  who,
  onOpen,
}: {
  payment: Payment
  who: People
  onOpen: () => void
}) {
  const yours = effectOn(paymentEntry(payment), who.viewerId)
  const from = who.nameOf(payment.fromId)
  const to = who.nameOf(payment.toId)
  return (
    <article className="relative flex flex-col gap-1 rounded-xl border p-3 hover:bg-muted/50">
      <button
        type="button"
        aria-label={`Edit Payment from ${from} to ${who.nameOf(payment.toId, "within")}`}
        onClick={onOpen}
        className="absolute inset-0 rounded-xl"
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">
          {from} → {to}
        </span>
        <span className="tabular-nums">{format(payment.amount)}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {formatDisplayDate(payment.date)} · Payment
        {payment.note !== "" && ` · ${payment.note}`}
      </div>
      <div className="text-sm">
        {yours === 0 ? (
          <span className="text-muted-foreground">Doesn't involve you</span>
        ) : (
          <>Your Balance {format(yours, { sign: "always" })}</>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{authorshipWords(payment, who)}</div>
    </article>
  )
}

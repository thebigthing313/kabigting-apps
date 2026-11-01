import { cn } from "cn"
import { HandCoinsIcon } from "lucide-react"
import { balanceWords, FORMER_MEMBER, paymentWords, type People } from "@/apps/split/words"
import type { Member } from "@/data/split"
import { suggestedPayments, type SuggestedPayment } from "@shared/split/rules"
import type { Shares } from "@shared/split/schemas"

type BalancesTabProps = {
  /** The Members and Former members, oldest Account first: everyone with a Balance. */
  holders: readonly Member[]
  /** Every holder's Balance. */
  totals: Shares
  who: People
  /** Opens Settle up filled in with a suggestion. */
  onSettle: (payment: SuggestedPayment) => void
}

/**
 * The Balances tab: a row per Member, the viewer first as "You", with their Balance in words and a
 * bar either side of a zero line, scaled to the largest Balance. Former members show only while
 * their Balance isn't zero. Below, one way to settle everyone up: suggested Payments, worked out
 * from the Balances and never stored, each opening Settle up filled in.
 */
export function BalancesTab({ holders, totals, who, onSettle }: BalancesTabProps) {
  const balanceOf = (id: string) => totals[id] ?? 0
  const rows = holders
    .filter((member) => member.standing === "member" || balanceOf(member.id) !== 0)
    .toSorted((a, b) => Number(b.id === who.viewerId) - Number(a.id === who.viewerId))
  const widest = Math.max(1, ...rows.map((member) => Math.abs(balanceOf(member.id))))
  const suggestions = suggestedPayments(totals, who.order)

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Balances" className="flex flex-col gap-3">
        {rows.map((member) => {
          const cents = balanceOf(member.id)
          return (
            <li key={member.id} className="flex flex-col gap-1 px-2">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">
                  {who.nameOf(member.id)}
                  {member.standing === "former" && (
                    <span className="font-normal text-muted-foreground"> · {FORMER_MEMBER}</span>
                  )}
                </span>
                <span className="text-muted-foreground">{balanceWords(member.id, cents, who)}</span>
              </span>
              {/* Owing grows left of the zero line, being owed grows right; the words above say
                  the same, so the bar is for comparing at a glance. */}
              <span aria-hidden className="relative block h-2.5 w-full">
                <span
                  className={cn(
                    "absolute inset-y-0",
                    cents > 0 && "left-1/2 rounded-r-[4px] bg-[#2a78d6] dark:bg-[#3987e5]",
                    cents < 0 && "right-1/2 rounded-l-[4px] bg-[#e34948] dark:bg-[#e66767]",
                  )}
                  style={{ width: `${(Math.abs(cents) / widest) * 50}%` }}
                />
                <span className="absolute -inset-y-0.5 left-1/2 w-px bg-foreground/40" />
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Left of the line owes the others; right of it is owed. Balances always add up to zero.
      </p>
      <section
        aria-label="One way to settle everyone up"
        className="flex flex-col gap-2 rounded-xl border p-3"
      >
        <h3 className="text-sm font-semibold">One way to settle everyone up</h3>
        {suggestions.length === 0 ? (
          <p className="text-sm">Everyone&apos;s settled up.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Worked out from the Balances, not who owes whom. Tap one to record it.
            </p>
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((payment) => (
                <li key={`${payment.fromId}-${payment.toId}`}>
                  <button
                    type="button"
                    onClick={() => onSettle(payment)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span>{paymentWords(payment.fromId, payment.toId, payment.amount, who)}</span>
                    <HandCoinsIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

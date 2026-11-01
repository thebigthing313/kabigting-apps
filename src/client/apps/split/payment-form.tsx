import { cn } from "cn"
import { ArrowLeftIcon, CheckIcon, Trash2Icon } from "lucide-react"
import { useId, useState } from "react"
import { EntryNoticeLine, type EntryNotice } from "@/apps/split/entry-form"
import {
  authorshipWords,
  FORMER_MEMBER,
  paymentWords,
  people,
  type People,
} from "@/apps/split/words"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { EntryOutcome, Member, Payment } from "@/data/split"
import { format } from "@shared/money"
import {
  editPaymentAllowed,
  newPaymentAllowed,
  paymentProblems,
  type SuggestedPayment,
  withBalances,
} from "@shared/split/rules"
import type { CreatePayment, Shares } from "@shared/split/schemas"

/** A Payment as the form hands it over; the caller gives a new one its id. */
export type NewPayment = Omit<CreatePayment, "id">

type PaymentFormProps = {
  viewerId: string
  /**
   * Every Account Split shows, oldest Account first. The Members and Former members get tiles, so
   * a Former member's Balance can be settled to zero.
   */
  members: readonly Member[]
  /** Every Member's current Balance, shown on their tile. */
  balances: Shares
  /** The household's date today, the date a new Payment starts on. */
  today: string
  /** A suggested Payment a new one starts as, when it opens from the Balances tab. */
  suggested?: SuggestedPayment
  /** Saves the Payment; resolves to how the save ended, the form closing unless refused or unreached. */
  onSave: (payment: NewPayment) => Promise<EntryOutcome>
  onCancel: () => void
  /** A newer version saved by someone else, or a save that didn't reach the server. */
  notice?: EntryNotice | null
  /** The saved Payment being changed, absent when recording one. Offers `onDelete`. */
  editing?: { payment: Payment; onDelete: () => void }
}

/**
 * Settle up, or change a saved Payment, full page: who's paying and who gets it from avatar tiles
 * showing each Member's Balance, Former members' included, then the Amount, date and an optional
 * note, and the Payment in plain words before it is recorded. A new one starts as the suggestion
 * it opened from, or else as the viewer paying the oldest other Member.
 */
export function PaymentForm({
  viewerId,
  members,
  balances,
  today,
  suggested,
  onSave,
  onCancel,
  notice,
  editing,
}: PaymentFormProps) {
  const saved = editing?.payment
  const start = saved ?? suggested
  const [fromId, setFromId] = useState(start?.fromId ?? viewerId)
  const [toId, setToId] = useState(
    start?.toId ??
      members.find((member) => member.id !== viewerId && member.standing === "member")?.id ??
      "",
  )
  const [amount, setAmount] = useState<number | null>(start?.amount ?? null)
  const [date, setDate] = useState(saved?.date ?? today)
  const [note, setNote] = useState(saved?.note ?? "")
  const [saving, setSaving] = useState(false)
  // Deleting takes a second tap.
  const [deleteArmed, setDeleteArmed] = useState(false)

  const who = people(viewerId, members)
  const allowed = saved ? editPaymentAllowed(members, saved) : newPaymentAllowed(members)
  const payment: NewPayment = { date, fromId, toId, amount: amount ?? 0, note }
  const problems = paymentProblems(payment, allowed)

  /**
   * On success the caller leaves the form; a refusal (already reported), or a save that never
   * reached the server, stays here with everything kept.
   */
  async function save() {
    if (problems.length > 0 || saving) return
    setSaving(true)
    await onSave({ ...payment, note: note.trim() })
    setSaving(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" aria-label="Cancel" onClick={onCancel}>
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-lg font-semibold">{saved ? "Edit Payment" : "Settle up"}</h1>
      </div>
      <Tiles
        title="Who's paying?"
        members={withBalances(members)}
        balances={balances}
        who={who}
        value={fromId}
        onPick={setFromId}
      />
      <Tiles
        title="Who gets it?"
        members={withBalances(members)}
        balances={balances}
        who={who}
        value={toId}
        onPick={setToId}
      />
      <AmountInput
        className="h-16 text-center text-3xl"
        aria-label="Amount"
        value={amount}
        onValueChange={setAmount}
        placeholder="$0.00"
      />
      <Input
        type="date"
        aria-label="Date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
      />
      <Input
        aria-label="Note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Note: settling up, or a loan for…"
      />
      <p role="status" aria-label="Summary" className="rounded-lg bg-muted p-3 text-sm">
        {paymentWords(fromId, toId, amount ?? 0, who)}
      </p>
      {problems.length > 0 && (
        <ul aria-label="Still to fix" className="text-sm text-destructive">
          {problems.map((problem) => (
            <li key={problem.field}>{problem.message}</li>
          ))}
        </ul>
      )}
      {saved && <p className="text-xs text-muted-foreground">{authorshipWords(saved, who)}</p>}
      {notice && <EntryNoticeLine notice={notice} who={who} onRetry={() => void save()} />}
      <Button
        size="lg"
        className="h-12"
        disabled={problems.length > 0 || saving}
        onClick={() => void save()}
      >
        <CheckIcon /> {saved ? "Save changes" : "Record Payment"}
      </Button>
      {editing && (
        <Button
          variant={deleteArmed ? "destructive" : "ghost"}
          className={cn(!deleteArmed && "text-destructive")}
          disabled={saving}
          onClick={() => (deleteArmed ? editing.onDelete() : setDeleteArmed(true))}
        >
          <Trash2Icon /> {deleteArmed ? "Tap again to delete for good" : "Delete Payment"}
        </Button>
      )}
    </div>
  )
}

/**
 * One avatar tile per Member and Former member, each with their Balance; the one picked is
 * checked.
 */
function Tiles({
  title,
  members,
  balances,
  who,
  value,
  onPick,
}: {
  title: string
  members: readonly Member[]
  balances: Shares
  who: People
  value: string
  onPick: (id: string) => void
}) {
  const idPrefix = useId()
  return (
    <div role="radiogroup" aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      <div className="grid grid-cols-4 gap-2">
        {members.map((member, index) => {
          const picked = value === member.id
          // Named by who it is; their Balance describes it.
          const nameId = `${idPrefix}-name-${index}`
          const balanceId = `${idPrefix}-balance-${index}`
          const formerId = `${idPrefix}-former-${index}`
          return (
            <button
              key={member.id}
              type="button"
              role="radio"
              aria-checked={picked}
              aria-labelledby={nameId}
              aria-describedby={
                member.standing === "former" ? `${balanceId} ${formerId}` : balanceId
              }
              onClick={() => onPick(member.id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-2 text-sm",
                picked && "border-primary ring-2 ring-primary/30",
              )}
            >
              <span
                aria-hidden
                className="grid size-10 place-items-center rounded-full bg-muted text-base font-semibold"
              >
                {member.name.slice(0, 1).toUpperCase()}
              </span>
              <span id={nameId} className="max-w-full truncate">
                {who.nameOf(member.id)}
              </span>
              <span id={balanceId} className="text-xs text-muted-foreground tabular-nums">
                {format(balances[member.id] ?? 0, { sign: "always" })}
              </span>
              {member.standing === "former" && (
                <span id={formerId} className="text-xs text-muted-foreground">
                  {FORMER_MEMBER}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

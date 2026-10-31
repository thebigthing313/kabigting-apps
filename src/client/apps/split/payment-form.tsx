import { cn } from "cn"
import { ArrowLeftIcon, CheckIcon, Trash2Icon } from "lucide-react"
import { useId, useState } from "react"
import { authorshipWords, paymentWords, people, type People } from "@/apps/split/words"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { Member, Payment } from "@/data/split"
import { format } from "@shared/money"
import { editPaymentAllowed, paymentProblems } from "@shared/split/rules"
import type { CreatePayment, Shares } from "@shared/split/schemas"

/** A Payment as the form hands it over; the caller gives a new one its id. */
export type NewPayment = Omit<CreatePayment, "id">

type PaymentFormProps = {
  viewerId: string
  /** The Members who can be on the Payment, oldest Account first. */
  members: readonly Member[]
  /** Every Member's current Balance, shown on their tile. */
  balances: Shares
  /** The household's date today, the date a new Payment starts on. */
  today: string
  /** Saves the Payment; resolves true once stored. */
  onSave: (payment: NewPayment) => Promise<boolean>
  onCancel: () => void
  /** The saved Payment being changed, absent when recording one. Offers `onDelete`. */
  editing?: { payment: Payment; onDelete: () => void }
}

/**
 * Settle up, or change a saved Payment, full page: who's paying and who gets it from avatar tiles
 * showing each Member's Balance, then the Amount, date and an optional note, and the Payment in
 * plain words before it is recorded. A new one starts as the viewer paying the oldest other Member.
 */
export function PaymentForm({
  viewerId,
  members,
  balances,
  today,
  onSave,
  onCancel,
  editing,
}: PaymentFormProps) {
  const saved = editing?.payment
  const order = members.map((member) => member.id)
  const [fromId, setFromId] = useState(saved?.fromId ?? viewerId)
  const [toId, setToId] = useState(
    saved?.toId ?? members.find((member) => member.id !== viewerId)?.id ?? "",
  )
  const [amount, setAmount] = useState<number | null>(saved?.amount ?? null)
  const [date, setDate] = useState(saved?.date ?? today)
  const [note, setNote] = useState(saved?.note ?? "")
  const [saving, setSaving] = useState(false)
  // Deleting takes a second tap.
  const [deleteArmed, setDeleteArmed] = useState(false)

  const who = people(viewerId, members)
  const allowed = saved ? editPaymentAllowed(order, saved) : new Set(order)
  const payment: NewPayment = { date, fromId, toId, amount: amount ?? 0, note }
  const problems = paymentProblems(payment, allowed)

  /** On success the caller leaves the form; a refusal (already reported) stays here. */
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
        members={members}
        balances={balances}
        who={who}
        value={fromId}
        onPick={setFromId}
      />
      <Tiles
        title="Who gets it?"
        members={members}
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

/** One avatar tile per Member, each with their Balance; the one picked is checked. */
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
          return (
            <button
              key={member.id}
              type="button"
              role="radio"
              aria-checked={picked}
              aria-labelledby={nameId}
              aria-describedby={balanceId}
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
            </button>
          )
        })}
      </div>
    </div>
  )
}

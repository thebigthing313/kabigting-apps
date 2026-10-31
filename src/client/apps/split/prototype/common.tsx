// PROTOTYPE, throwaway: form state and tiny display bits shared by the Split UI variants. Layout is
// deliberately not shared: each variant lays its forms out its own way.
import { cn } from "cn"
import { useState } from "react"
import { today } from "@shared/dates"
import { format } from "@shared/money"
import {
  CURRENT,
  emptySide,
  type Expense,
  formMembers,
  MEMBERS,
  type Mode,
  type Payment,
  resolveSide,
  type Side,
  type Store,
} from "@/apps/split/prototype/store"

export type SideKey = "paid" | "owed"

export const MODE_LABELS: Record<Mode, string> = {
  equal: "Equally",
  exact: "Exact $",
  percent: "Percent",
}

export function useExpenseDraft(store: Store, expense: Expense | null) {
  const [description, setDescription] = useState(expense?.description ?? "")
  const [total, setTotal] = useState<number | null>(expense?.total ?? null)
  const [date, setDate] = useState(expense?.date ?? today())
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? "general")
  const [note, setNote] = useState(expense?.note ?? "")
  const [sides, setSides] = useState<Record<SideKey, Side>>({
    paid: expense?.paid ?? emptySide("equal", [store.viewerId]),
    owed:
      expense?.owed ??
      emptySide(
        "equal",
        CURRENT.map((m) => m.id),
      ),
  })
  const members = formMembers(expense)
  const paid = resolveSide(total, sides.paid, members)
  const owed = resolveSide(total, sides.owed, members)
  const problems = [
    description.trim() === "" ? "Add a description" : null,
    total === null || total === 0 ? "Enter a total" : null,
    paid.problem ? `Paid: ${paid.problem}` : null,
    owed.problem ? `Owed: ${owed.problem}` : null,
  ].filter((p) => p !== null)

  const updateSide = (key: SideKey, change: (side: Side) => Side) =>
    setSides((prev) => ({ ...prev, [key]: change(prev[key]) }))

  return {
    members,
    description,
    setDescription,
    total,
    setTotal,
    date,
    setDate,
    categoryId,
    setCategoryId,
    note,
    setNote,
    sides,
    setSides,
    paid,
    owed,
    problems,
    isRefund: total !== null && total < 0,
    // Switching to Exact $ starts from the cents the side shows now, so nothing has to be retyped.
    setMode: (key: SideKey, mode: Mode) => {
      const current = (key === "paid" ? paid : owed).shares
      updateSide(key, (side) => ({
        ...side,
        mode,
        exact:
          mode === "exact" && Object.values(side.exact).every((c) => !c) ? current : side.exact,
      }))
    },
    toggle: (key: SideKey, id: string) =>
      updateSide(key, (side) => ({
        ...side,
        ticked: side.ticked.includes(id)
          ? side.ticked.filter((t) => t !== id)
          : [...side.ticked, id],
      })),
    setExact: (key: SideKey, id: string, cents: number | null) =>
      updateSide(key, (side) => ({ ...side, exact: { ...side.exact, [id]: cents } })),
    setPercent: (key: SideKey, id: string, text: string) =>
      updateSide(key, (side) => ({ ...side, percent: { ...side.percent, [id]: text } })),
    save() {
      if (problems.length > 0) return false
      store.saveExpense(
        {
          description: description.trim(),
          total: total!,
          date,
          categoryId,
          note: note.trim(),
          paid: sides.paid,
          owed: sides.owed,
          paidShares: paid.shares,
          owedShares: owed.shares,
        },
        expense?.id ?? null,
      )
      return true
    },
  }
}

export type ExpenseDraft = ReturnType<typeof useExpenseDraft>

export function usePaymentDraft(store: Store, payment: Payment | null) {
  const [fromId, setFromId] = useState(payment?.fromId ?? store.viewerId)
  const [toId, setToId] = useState(
    payment?.toId ?? CURRENT.find((m) => m.id !== store.viewerId)!.id,
  )
  const [amount, setAmount] = useState<number | null>(payment?.amount ?? null)
  const [date, setDate] = useState(payment?.date ?? today())
  const [note, setNote] = useState(payment?.note ?? "")
  const problems = [
    fromId === toId ? "Pick two different people" : null,
    amount === null || amount <= 0 ? "Enter an amount above zero" : null,
  ].filter((p) => p !== null)
  return {
    fromId,
    setFromId,
    toId,
    setToId,
    amount,
    setAmount,
    date,
    setDate,
    note,
    setNote,
    problems,
    save() {
      if (problems.length > 0) return false
      store.savePayment(
        { fromId, toId, amount: amount!, date, note: note.trim() },
        payment?.id ?? null,
      )
      return true
    },
  }
}

export type PaymentDraft = ReturnType<typeof usePaymentDraft>

/** A Balance or effect with its sign spelled out, so direction never rests on colour alone. */
export function Signed({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        cents > 0 && "text-emerald-700 dark:text-emerald-400",
        cents < 0 && "text-red-700 dark:text-red-400",
        cents === 0 && "text-muted-foreground",
        className,
      )}
    >
      {format(cents, { sign: "always" })}
    </span>
  )
}

/** A Balance in words from the viewer's side. */
export function balanceWords(cents: number): string {
  if (cents === 0) return "settled up"
  return cents > 0 ? `is owed ${format(cents)}` : `owes ${format(-cents)}`
}

/** Any Member, Former members included: a Payment may name them so they can settle to zero. */
export function MemberSelect({
  label,
  value,
  onChange,
  className,
}: {
  label: string
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <select
      aria-label={label}
      className={cn("h-8 rounded-lg border bg-transparent px-2", className)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {MEMBERS.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name}
          {member.former ? " (former)" : ""}
        </option>
      ))}
    </select>
  )
}

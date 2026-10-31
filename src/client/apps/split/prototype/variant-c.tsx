// PROTOTYPE, throwaway. Variant C: a ledger. Each Member has a column holding what every Expense or
// Payment did to their Balance, with Balances in the footer. Expenses open in a side sheet as one
// grid (a row per Member, Paid and Owed columns); Payments are added from a bar above the ledger.
import { cn } from "cn"
import { PlusIcon } from "lucide-react"
import { useState } from "react"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatMonthDay } from "@shared/dates"
import { format } from "@shared/money"
import {
  type ExpenseDraft,
  MODE_LABELS,
  type SideKey,
  Signed,
  useExpenseDraft,
  usePaymentDraft,
  MemberSelect,
} from "@/apps/split/prototype/common"
import {
  CATEGORIES,
  CURRENT,
  MEMBERS,
  type Expense,
  MODES,
  type Payment,
  type Store,
  categoryName,
  effect,
  emptySide,
  memberName,
} from "@/apps/split/prototype/store"

export function VariantC({ store }: { store: Store }) {
  // undefined: sheet closed; null: a new Expense.
  const [editing, setEditing] = useState<Expense | null | undefined>(undefined)
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null)
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Split</h1>
        <Button onClick={() => setEditing(null)}>
          <PlusIcon /> Add Expense
        </Button>
      </div>
      <PaymentBar
        key={editingPayment?.id ?? "new"}
        store={store}
        payment={editingPayment}
        onDone={() => setEditingPayment(null)}
      />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left font-medium">Date</th>
              <th className="px-2 py-2 text-left font-medium">What</th>
              <th className="px-2 py-2 text-right font-medium">Total</th>
              {MEMBERS.map((member) => (
                <th
                  key={member.id}
                  className={cn(
                    "px-2 py-2 text-right font-medium",
                    member.id === store.viewerId && "text-foreground",
                    member.former && "italic",
                  )}
                >
                  {member.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {store.entries.map((entry) => {
              const moves = effect(entry)
              const selected =
                entry.kind === "payment"
                  ? editingPayment?.id === entry.id
                  : editing?.id === entry.id
              return (
                <tr
                  key={entry.id}
                  onClick={() =>
                    entry.kind === "expense" ? setEditing(entry) : setEditingPayment(entry)
                  }
                  className={cn(
                    "cursor-pointer border-t hover:bg-muted/40",
                    selected && "bg-muted",
                  )}
                >
                  <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                    {formatMonthDay(entry.date)}
                  </td>
                  <td className="px-2 py-1.5">
                    {entry.kind === "expense" ? (
                      <>
                        {entry.description}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {categoryName(entry.categoryId)}
                          {entry.total < 0 && " · Refund"}
                        </span>
                      </>
                    ) : (
                      <span className="italic">
                        {memberName(entry.fromId)} paid {memberName(entry.toId)}
                        {entry.note && (
                          <span className="ml-2 text-xs text-muted-foreground not-italic">
                            {entry.note}
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {format(entry.kind === "expense" ? entry.total : entry.amount)}
                  </td>
                  {MEMBERS.map((member) => (
                    <td key={member.id} className="px-2 py-1.5 text-right">
                      {moves[member.id] ? <Signed cents={moves[member.id]!} /> : ""}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          <tfoot className="border-t-2 font-semibold">
            <tr>
              <td className="px-2 py-2" colSpan={3}>
                Balance
              </td>
              {MEMBERS.map((member) => (
                <td key={member.id} className="px-2 py-2 text-right">
                  <Signed cents={store.balances[member.id] ?? 0} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <Sheet open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg data-[side=right]:sm:max-w-lg">
          {editing !== undefined && (
            <ExpenseGrid
              key={editing?.id ?? "new"}
              store={store}
              expense={editing}
              onDone={() => setEditing(undefined)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ExpenseGrid({
  store,
  expense,
  onDone,
}: {
  store: Store
  expense: Expense | null
  onDone: () => void
}) {
  const draft = useExpenseDraft(store, expense)
  const [armed, setArmed] = useState(false)
  const current = CURRENT.map((m) => m.id)
  const preset = (paid: string[], owed: string[]) =>
    draft.setSides({ paid: emptySide("equal", paid), owed: emptySide("equal", owed) })
  return (
    <div className="flex flex-col gap-4 p-4">
      <SheetHeader className="p-0">
        <SheetTitle>
          {expense ? "Edit Expense" : "Add Expense"}
          {draft.isRefund && " · Refund"}
        </SheetTitle>
      </SheetHeader>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          aria-label="Description"
          value={draft.description}
          onChange={(event) => draft.setDescription(event.target.value)}
          placeholder="Description"
        />
        <AmountInput
          aria-label="Total"
          className="w-32 text-right"
          value={draft.total}
          onValueChange={draft.setTotal}
          placeholder="Total"
        />
        <select
          aria-label="Category"
          className="h-8 rounded-lg border bg-transparent px-2 text-sm"
          value={draft.categoryId}
          onChange={(event) => draft.setCategoryId(event.target.value)}
        >
          {CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Input
          type="date"
          aria-label="Date"
          className="w-36"
          value={draft.date}
          onChange={(event) => draft.setDate(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="py-1 text-muted-foreground">Quick:</span>
        <Chip onClick={() => preset([store.viewerId], current)}>I paid, split equally</Chip>
        {current
          .filter((id) => id !== store.viewerId)
          .map((id) => (
            <Chip key={id} onClick={() => preset([store.viewerId], [id])}>
              I paid, {memberName(id)} owes it all
            </Chip>
          ))}
        <Chip onClick={() => preset(current, current)}>All paid equally</Chip>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pb-1 text-left font-medium">Member</th>
            <ModeHeader draft={draft} sideKey="paid" label={draft.isRefund ? "Got back" : "Paid"} />
            <ModeHeader draft={draft} sideKey="owed" label={draft.isRefund ? "Shares" : "Owes"} />
          </tr>
        </thead>
        <tbody>
          {draft.members.map((id) => (
            <tr key={id} className="border-t">
              <td className="py-1.5">
                {memberName(id)}
                {MEMBERS.find((m) => m.id === id)?.former && (
                  <span className="ml-1 text-xs text-muted-foreground">former</span>
                )}
              </td>
              <SideCell draft={draft} sideKey="paid" id={id} />
              <SideCell draft={draft} sideKey="owed" id={id} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t text-xs">
            <td className="pt-1.5 text-muted-foreground">Left</td>
            {(["paid", "owed"] as const).map((key) => (
              <td
                key={key}
                className={cn(
                  "pt-1.5 text-right",
                  draft[key].problem
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-muted-foreground",
                )}
              >
                {draft[key].status}
              </td>
            ))}
          </tr>
          <tr className="text-xs">
            <td className="pt-1 text-muted-foreground">Net</td>
            <td colSpan={2} className="pt-1 text-right">
              {draft.members.map((id) => {
                const net = (draft.paid.shares[id] ?? 0) - (draft.owed.shares[id] ?? 0)
                return (
                  <span key={id} className="ml-3 whitespace-nowrap">
                    {memberName(id)} <Signed cents={net} />
                  </span>
                )
              })}
            </td>
          </tr>
        </tfoot>
      </table>

      <Input
        aria-label="Note"
        value={draft.note}
        onChange={(event) => draft.setNote(event.target.value)}
        placeholder="Note (optional)"
      />
      {expense && (
        <p className="text-xs text-muted-foreground">
          Added by {memberName(expense.addedBy)} · last changed by {memberName(expense.changedBy)}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        {expense ? (
          <Button
            variant="destructive"
            onClick={() => {
              if (!armed) return setArmed(true)
              store.remove(expense.id)
              onDone()
            }}
          >
            {armed ? "Delete for good?" : "Delete"}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {draft.problems.length > 0 && (
            <span className="text-xs text-muted-foreground">{draft.problems[0]}</span>
          )}
          <Button
            disabled={draft.problems.length > 0}
            onClick={() => {
              if (draft.save()) onDone()
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function ModeHeader({
  draft,
  sideKey,
  label,
}: {
  draft: ExpenseDraft
  sideKey: SideKey
  label: string
}) {
  return (
    <th className="pb-1 text-right font-medium">
      {label}{" "}
      <select
        aria-label={`${label} split mode`}
        className="rounded border bg-transparent px-1 py-0.5 text-xs"
        value={draft.sides[sideKey].mode}
        onChange={(event) =>
          draft.setMode(sideKey, MODES.find((mode) => mode === event.target.value) ?? "equal")
        }
      >
        {MODES.map((mode) => (
          <option key={mode} value={mode}>
            {MODE_LABELS[mode]}
          </option>
        ))}
      </select>
    </th>
  )
}

function SideCell({ draft, sideKey, id }: { draft: ExpenseDraft; sideKey: SideKey; id: string }) {
  const side = draft.sides[sideKey]
  const cents = draft[sideKey].shares[id]
  return (
    <td className="py-1.5 text-right">
      <span className="inline-flex items-center justify-end gap-1.5">
        {side.mode === "equal" && (
          <>
            <span className="w-16 text-muted-foreground tabular-nums">
              {cents ? format(cents) : "–"}
            </span>
            <Checkbox
              aria-label={`${memberName(id)} ${sideKey}`}
              checked={side.ticked.includes(id)}
              onCheckedChange={() => draft.toggle(sideKey, id)}
            />
          </>
        )}
        {side.mode === "exact" && (
          <AmountInput
            aria-label={`${memberName(id)} ${sideKey}`}
            className="h-7 w-24 text-right"
            value={side.exact[id] ?? null}
            onValueChange={(value) => draft.setExact(sideKey, id, value)}
            placeholder="0.00"
          />
        )}
        {side.mode === "percent" && (
          <>
            <span className="w-16 text-xs text-muted-foreground tabular-nums">
              {cents ? format(cents) : "–"}
            </span>
            <Input
              aria-label={`${memberName(id)} ${sideKey} percent`}
              inputMode="decimal"
              className="h-7 w-16 text-right"
              value={side.percent[id] ?? ""}
              onChange={(event) => draft.setPercent(sideKey, id, event.target.value)}
              placeholder="%"
            />
          </>
        )}
      </span>
    </td>
  )
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 hover:bg-muted"
    >
      {children}
    </button>
  )
}

/** A one-line Payment form above the ledger; picking a Payment row loads it here to edit. */
function PaymentBar({
  store,
  payment,
  onDone,
}: {
  store: Store
  payment: Payment | null
  onDone: () => void
}) {
  const draft = usePaymentDraft(store, payment)
  const [armed, setArmed] = useState(false)
  return (
    <form
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm",
        payment && "border-primary",
      )}
      onSubmit={(event) => {
        event.preventDefault()
        if (draft.save()) onDone()
      }}
    >
      <span className="font-medium">{payment ? "Edit Payment:" : "Payment:"}</span>
      <MemberSelect label="From" value={draft.fromId} onChange={draft.setFromId} />
      <span>paid</span>
      <MemberSelect label="To" value={draft.toId} onChange={draft.setToId} />
      <AmountInput
        aria-label="Amount"
        className="w-28 text-right"
        value={draft.amount}
        onValueChange={draft.setAmount}
        placeholder="0.00"
      />
      <Input
        type="date"
        aria-label="Date"
        className="w-36"
        value={draft.date}
        onChange={(event) => draft.setDate(event.target.value)}
      />
      <Input
        aria-label="Note"
        className="min-w-32 flex-1"
        value={draft.note}
        onChange={(event) => draft.setNote(event.target.value)}
        placeholder="Note (optional)"
      />
      <Button type="submit" disabled={draft.problems.length > 0}>
        {payment ? "Save" : "Add"}
      </Button>
      {payment && (
        <>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!armed) return setArmed(true)
              store.remove(payment.id)
              onDone()
            }}
          >
            {armed ? "Delete for good?" : "Delete"}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </>
      )}
    </form>
  )
}

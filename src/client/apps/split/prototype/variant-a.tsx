// PROTOTYPE, throwaway. Variant A: a Balances strip over a month-grouped list; Add opens a dialog
// with every field at once and the paid and owed sides side by side.
import { cn } from "cn"
import { ArrowRightIcon, HandCoinsIcon, PlusIcon, ReceiptIcon } from "lucide-react"
import { useState } from "react"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatDisplayDate, formatMonth, monthOfDate } from "@shared/dates"
import { format } from "@shared/money"
import {
  type ExpenseDraft,
  MODE_LABELS,
  type SideKey,
  Signed,
  balanceWords,
  useExpenseDraft,
  usePaymentDraft,
  MemberSelect,
} from "@/apps/split/prototype/common"
import {
  CATEGORIES,
  MEMBERS,
  type Entry,
  type Expense,
  MODES,
  type Payment,
  type Store,
  categoryName,
  describeShares,
  effect,
  memberName,
} from "@/apps/split/prototype/store"

type Open = { kind: "expense"; entry: Expense | null } | { kind: "payment"; entry: Payment | null }

export function VariantA({ store }: { store: Store }) {
  const [open, setOpen] = useState<Open | null>(null)
  const months = new Map<string, Entry[]>()
  for (const entry of store.entries) {
    const month = monthOfDate(entry.date)
    months.set(month, [...(months.get(month) ?? []), entry])
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Split</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpen({ kind: "payment", entry: null })}>
            <HandCoinsIcon /> Record Payment
          </Button>
          <Button onClick={() => setOpen({ kind: "expense", entry: null })}>
            <PlusIcon /> Add Expense
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MEMBERS.map((member) => {
          const cents = store.balances[member.id] ?? 0
          return (
            <div
              key={member.id}
              className={cn(
                "rounded-lg border p-3",
                member.id === store.viewerId && "border-primary",
              )}
            >
              <div className="text-sm text-muted-foreground">
                {member.name}
                {member.id === store.viewerId && " (you)"}
                {member.former && " · former"}
              </div>
              <Signed cents={cents} className="text-lg font-semibold" />
              <div className="text-xs text-muted-foreground">{balanceWords(cents)}</div>
            </div>
          )
        })}
      </div>

      {[...months].map(([month, entries]) => (
        <section key={month} className="flex flex-col">
          <h2 className="pb-1 text-sm font-medium text-muted-foreground">{formatMonth(month)}</h2>
          <ul className="divide-y rounded-lg border">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                viewerId={store.viewerId}
                onOpen={() =>
                  setOpen(
                    entry.kind === "expense"
                      ? { kind: "expense", entry }
                      : { kind: "payment", entry },
                  )
                }
              />
            ))}
          </ul>
        </section>
      ))}

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {open?.kind === "expense" && (
            <ExpenseForm
              key={open.entry?.id ?? "new"}
              store={store}
              expense={open.entry}
              onDone={() => setOpen(null)}
            />
          )}
          {open?.kind === "payment" && (
            <PaymentForm
              key={open.entry?.id ?? "new"}
              store={store}
              payment={open.entry}
              onDone={() => setOpen(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EntryRow({
  entry,
  viewerId,
  onOpen,
}: {
  entry: Entry
  viewerId: string
  onOpen: () => void
}) {
  const mine = effect(entry)[viewerId] ?? 0
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
      >
        <span className="w-12 shrink-0 text-xs text-muted-foreground">
          {formatDisplayDate(entry.date).replace(/,? \d{4}$/, "")}
        </span>
        {entry.kind === "expense" ? (
          <ReceiptIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <HandCoinsIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          {entry.kind === "expense" ? (
            <>
              <span className="block truncate font-medium">
                {entry.description}
                {entry.total < 0 && (
                  <span className="ml-2 rounded bg-muted px-1.5 text-xs">Refund</span>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {categoryName(entry.categoryId)} · {describeShares(entry.paidShares)} paid{" "}
                {format(entry.total)}
              </span>
            </>
          ) : (
            <>
              <span className="block truncate font-medium">
                {memberName(entry.fromId)} paid {memberName(entry.toId)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Payment{entry.note && ` · ${entry.note}`}
              </span>
            </>
          )}
        </span>
        <span className="text-right">
          <span className="block text-sm tabular-nums">
            {format(entry.kind === "expense" ? entry.total : entry.amount)}
          </span>
          <span className="block text-xs">
            {mine === 0 ? (
              <span className="text-muted-foreground">not involved</span>
            ) : (
              <>
                you <Signed cents={mine} />
              </>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

function ExpenseForm({
  store,
  expense,
  onDone,
}: {
  store: Store
  expense: Expense | null
  onDone: () => void
}) {
  const draft = useExpenseDraft(store, expense)
  const [tried, setTried] = useState(false)
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setTried(true)
        if (draft.save()) onDone()
      }}
    >
      <DialogHeader>
        <DialogTitle>
          {expense ? "Edit Expense" : "Add Expense"}
          {draft.isRefund && (
            <span className="ml-2 rounded bg-muted px-1.5 text-xs font-normal">Refund</span>
          )}
        </DialogTitle>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <label className="flex flex-col gap-1 text-sm">
          Description
          <Input
            value={draft.description}
            onChange={(event) => draft.setDescription(event.target.value)}
            placeholder="Groceries at the market"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Total
          <AmountInput value={draft.total} onValueChange={draft.setTotal} placeholder="0.00" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select
            className="h-8 rounded-lg border bg-transparent px-2"
            value={draft.categoryId}
            onChange={(event) => draft.setCategoryId(event.target.value)}
          >
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date
          <Input
            type="date"
            value={draft.date}
            onChange={(event) => draft.setDate(event.target.value)}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SideEditor draft={draft} sideKey="paid" title={draft.isRefund ? "Got back" : "Paid by"} />
        <SideEditor draft={draft} sideKey="owed" title={draft.isRefund ? "Shared by" : "Owed by"} />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Note (optional)
        <Textarea
          value={draft.note}
          onChange={(event) => draft.setNote(event.target.value)}
          rows={2}
        />
      </label>

      {expense && (
        <p className="text-xs text-muted-foreground">
          Added by {memberName(expense.addedBy)} · last changed by {memberName(expense.changedBy)}
        </p>
      )}
      {tried && draft.problems.length > 0 && (
        <ul className="text-sm text-destructive">
          {draft.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-between gap-2">
        {expense ? (
          <DeleteButton
            onDelete={() => {
              store.remove(expense.id)
              onDone()
            }}
          />
        ) : (
          <span />
        )}
        <Button type="submit">{expense ? "Save changes" : "Add Expense"}</Button>
      </div>
    </form>
  )
}

function SideEditor({
  draft,
  sideKey,
  title,
}: {
  draft: ExpenseDraft
  sideKey: SideKey
  title: string
}) {
  const side = draft.sides[sideKey]
  const result = draft[sideKey]
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="grid grid-cols-3 rounded-md border p-0.5 text-xs">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => draft.setMode(sideKey, mode)}
            className={cn(
              "rounded px-2 py-1",
              side.mode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {draft.members.map((id) => (
          <li key={id} className="flex items-center gap-2 text-sm">
            {side.mode === "equal" ? (
              <label className="flex flex-1 items-center gap-2">
                <Checkbox
                  checked={side.ticked.includes(id)}
                  onCheckedChange={() => draft.toggle(sideKey, id)}
                />
                {memberName(id)}
              </label>
            ) : (
              <span className="flex-1">{memberName(id)}</span>
            )}
            {side.mode === "exact" && (
              <AmountInput
                className="h-7 w-24 text-right"
                aria-label={`${memberName(id)} ${title}`}
                value={side.exact[id] ?? null}
                onValueChange={(cents) => draft.setExact(sideKey, id, cents)}
                placeholder="0.00"
              />
            )}
            {side.mode === "percent" && (
              <span className="flex items-center gap-1">
                <Input
                  className="h-7 w-16 text-right"
                  inputMode="decimal"
                  aria-label={`${memberName(id)} percent`}
                  value={side.percent[id] ?? ""}
                  onChange={(event) => draft.setPercent(sideKey, id, event.target.value)}
                  placeholder="0"
                />
                %
              </span>
            )}
            {side.mode !== "exact" && (
              <span className="w-20 text-right text-muted-foreground tabular-nums">
                {result.shares[id] ? format(result.shares[id]) : "–"}
              </span>
            )}
          </li>
        ))}
      </ul>
      <div
        className={cn(
          "rounded px-2 py-1 text-xs",
          result.problem
            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            : "bg-muted",
        )}
      >
        {result.status}
      </div>
    </fieldset>
  )
}

function PaymentForm({
  store,
  payment,
  onDone,
}: {
  store: Store
  payment: Payment | null
  onDone: () => void
}) {
  const draft = usePaymentDraft(store, payment)
  const [tried, setTried] = useState(false)
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setTried(true)
        if (draft.save()) onDone()
      }}
    >
      <DialogHeader>
        <DialogTitle>{payment ? "Edit Payment" : "Record Payment"}</DialogTitle>
      </DialogHeader>
      <div className="flex items-center gap-2">
        <MemberSelect
          label="From"
          className="flex-1"
          value={draft.fromId}
          onChange={draft.setFromId}
        />
        <ArrowRightIcon className="size-4 shrink-0" />
        <MemberSelect label="To" className="flex-1" value={draft.toId} onChange={draft.setToId} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Amount
          <AmountInput value={draft.amount} onValueChange={draft.setAmount} placeholder="0.00" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Date
          <Input
            type="date"
            value={draft.date}
            onChange={(event) => draft.setDate(event.target.value)}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Note (optional)
        <Input
          value={draft.note}
          onChange={(event) => draft.setNote(event.target.value)}
          placeholder="Settling up, or a loan for…"
        />
      </label>
      <p className="text-xs text-muted-foreground">
        {memberName(draft.fromId)}'s Balance goes up and {memberName(draft.toId)}'s goes down by{" "}
        {format(draft.amount ?? 0)}.
      </p>
      {tried && draft.problems.length > 0 && (
        <ul className="text-sm text-destructive">
          {draft.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-between gap-2">
        {payment ? (
          <DeleteButton
            onDelete={() => {
              store.remove(payment.id)
              onDone()
            }}
          />
        ) : (
          <span />
        )}
        <Button type="submit">{payment ? "Save changes" : "Record Payment"}</Button>
      </div>
    </form>
  )
}

/** Two clicks, never a browser confirm: the second click deletes for good. */
function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <Button
      type="button"
      variant="destructive"
      onClick={() => (armed ? onDelete() : setArmed(true))}
    >
      {armed ? "Delete for good?" : "Delete"}
    </Button>
  )
}

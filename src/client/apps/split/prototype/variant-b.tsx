// PROTOTYPE, throwaway. Variant B: your own Balance up top over a feed of cards; Add takes over the
// page as guided steps (what, who paid, who owes, review) with one-tap answers for the common cases.
import { cn } from "cn"
import { ArrowLeftIcon, CheckIcon, HandCoinsIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formatDisplayDate } from "@shared/dates"
import { format } from "@shared/money"
import {
  type ExpenseDraft,
  MODE_LABELS,
  type SideKey,
  Signed,
  balanceWords,
  useExpenseDraft,
  usePaymentDraft,
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
  describeShares,
  effect,
  emptySide,
  memberName,
} from "@/apps/split/prototype/store"

type Page =
  | { kind: "list" }
  | { kind: "expense"; entry: Expense | null }
  | { kind: "payment"; entry: Payment | null }

export function VariantB({ store }: { store: Store }) {
  const [page, setPage] = useState<Page>({ kind: "list" })
  const back = () => setPage({ kind: "list" })
  if (page.kind === "expense")
    return (
      <ExpenseSteps
        key={page.entry?.id ?? "new"}
        store={store}
        expense={page.entry}
        onDone={back}
      />
    )
  if (page.kind === "payment")
    return (
      <PaymentPage key={page.entry?.id ?? "new"} store={store} payment={page.entry} onDone={back} />
    )

  const mine = store.balances[store.viewerId] ?? 0
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <div className="text-sm opacity-80">Your Balance</div>
        <div className="text-3xl font-semibold tabular-nums">
          {format(mine, { sign: "always" })}
        </div>
        <div className="text-sm opacity-80">
          {mine === 0
            ? "You're settled up"
            : mine > 0
              ? "The others owe you"
              : "You owe the others"}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {MEMBERS.filter((m) => m.id !== store.viewerId).map((member) => (
            <span key={member.id} className="opacity-90">
              {member.name}
              {member.former && " (former)"} {balanceWords(store.balances[member.id] ?? 0)}
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="lg"
          className="h-12"
          onClick={() => setPage({ kind: "expense", entry: null })}
        >
          <PlusIcon /> Add Expense
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-12"
          onClick={() => setPage({ kind: "payment", entry: null })}
        >
          <HandCoinsIcon /> Settle up
        </Button>
      </div>
      <ul className="flex flex-col gap-2">
        {store.entries.map((entry) => {
          const you = effect(entry)[store.viewerId] ?? 0
          return (
            <li key={entry.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-1 rounded-xl border p-3 text-left hover:bg-muted/50"
                onClick={() =>
                  setPage(
                    entry.kind === "expense"
                      ? { kind: "expense", entry }
                      : { kind: "payment", entry },
                  )
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {entry.kind === "expense"
                      ? entry.description
                      : `${memberName(entry.fromId)} → ${memberName(entry.toId)}`}
                  </span>
                  <span className="tabular-nums">
                    {format(entry.kind === "expense" ? entry.total : entry.amount)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDisplayDate(entry.date)} ·{" "}
                  {entry.kind === "expense"
                    ? `${categoryName(entry.categoryId)}${entry.total < 0 ? " · Refund" : ""}`
                    : `Payment${entry.note ? ` · ${entry.note}` : ""}`}
                </div>
                {entry.kind === "expense" && (
                  <div className="text-xs">
                    Paid: {describeShares(entry.paidShares)}
                    <br />
                    Owed: {describeShares(entry.owedShares)}
                  </div>
                )}
                <div className="text-sm">
                  {you === 0 ? (
                    <span className="text-muted-foreground">Doesn't involve you</span>
                  ) : (
                    <>
                      Your Balance <Signed cents={you} />
                    </>
                  )}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const STEPS = ["What", "Who paid", "Who owes", "Review"] as const

function ExpenseSteps({
  store,
  expense,
  onDone,
}: {
  store: Store
  expense: Expense | null
  onDone: () => void
}) {
  const draft = useExpenseDraft(store, expense)
  // Editing opens on the review, where every step is one tap away.
  const [step, setStep] = useState(expense ? 3 : 0)
  const whatOk = draft.description.trim() !== "" && draft.total !== null && draft.total !== 0
  const stepOk = [
    whatOk,
    draft.paid.problem === null,
    draft.owed.problem === null,
    draft.problems.length === 0,
  ]
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (step === 0 || expense ? onDone() : setStep(step - 1))}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-lg font-semibold">{expense ? "Edit Expense" : "New Expense"}</h1>
      </div>
      <ol className="grid grid-cols-4 gap-1 text-center text-xs">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              disabled={index > step && !expense}
              onClick={() => setStep(index)}
              className={cn(
                "w-full border-t-4 pt-1",
                index === step
                  ? "border-primary font-medium"
                  : index < step
                    ? "border-primary/40"
                    : "border-muted",
              )}
            >
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <AmountInput
            className="h-16 text-center text-3xl"
            aria-label="Total"
            value={draft.total}
            onValueChange={draft.setTotal}
            placeholder="$0.00"
          />
          {draft.isRefund && (
            <p className="text-center text-sm text-muted-foreground">
              A negative total is a Refund: money given back.
            </p>
          )}
          <Input
            aria-label="Description"
            value={draft.description}
            onChange={(event) => draft.setDescription(event.target.value)}
            placeholder="What was it for?"
          />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => draft.setCategoryId(category.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  draft.categoryId === category.id &&
                    "border-primary bg-primary text-primary-foreground",
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
          <Input
            type="date"
            aria-label="Date"
            value={draft.date}
            onChange={(event) => draft.setDate(event.target.value)}
          />
          <Textarea
            aria-label="Note"
            rows={2}
            value={draft.note}
            onChange={(event) => draft.setNote(event.target.value)}
            placeholder="Note (optional)"
          />
        </div>
      )}
      {step === 1 && <WhoStep draft={draft} store={store} sideKey="paid" />}
      {step === 2 && <WhoStep draft={draft} store={store} sideKey="owed" />}
      {step === 3 && <Review draft={draft} expense={expense} goTo={setStep} />}

      <div className="flex flex-col gap-2">
        {step < 3 ? (
          <Button
            size="lg"
            className="h-12"
            disabled={!stepOk[step]}
            onClick={() => setStep(expense ? 3 : step + 1)}
          >
            {expense ? "Back to review" : "Next"}
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-12"
            disabled={!stepOk[3]}
            onClick={() => draft.save() && onDone()}
          >
            <CheckIcon /> {expense ? "Save changes" : "Add Expense"}
          </Button>
        )}
        {expense && step === 3 && (
          <DeleteButton
            onDelete={() => {
              store.remove(expense.id)
              onDone()
            }}
          />
        )}
      </div>
    </div>
  )
}

/** One-tap answers for the usual cases; "Split it differently" opens the full mode editor. */
function WhoStep({
  draft,
  store,
  sideKey,
}: {
  draft: ExpenseDraft
  store: Store
  sideKey: SideKey
}) {
  const side = draft.sides[sideKey]
  const result = draft[sideKey]
  const current = draft.members.filter((id) => CURRENT.some((m) => m.id === id))
  const isOnly = (id: string) =>
    side.mode === "equal" && side.ticked.length === 1 && side.ticked[0] === id
  const isAll =
    side.mode === "equal" &&
    current.every((id) => side.ticked.includes(id)) &&
    side.ticked.length === current.length
  const [custom, setCustom] = useState(!isAll && !current.some(isOnly))
  const pick = (ticked: string[]) => {
    setCustom(false)
    draft.setSides({ ...draft.sides, [sideKey]: { ...emptySide("equal", ticked) } })
  }
  const you = (id: string) => (id === store.viewerId ? `${memberName(id)} (you)` : memberName(id))
  const question =
    sideKey === "paid"
      ? draft.isRefund
        ? "Who got the money back?"
        : "Who paid?"
      : draft.isRefund
        ? "Who shares the Refund?"
        : "Who owes for it?"
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-base font-medium">{question}</h2>
      {sideKey === "owed" && (
        <Option selected={isAll && !custom} onClick={() => pick(current)}>
          Everyone equally
          <span className="block text-xs text-muted-foreground">
            {format(Math.round((draft.total ?? 0) / current.length))} each, roughly
          </span>
        </Option>
      )}
      {current.map((id) => (
        <Option key={id} selected={isOnly(id) && !custom} onClick={() => pick([id])}>
          {sideKey === "paid" ? `${you(id)} paid it all` : `Only ${you(id)}`}
        </Option>
      ))}
      <Option selected={custom} onClick={() => setCustom(true)}>
        {sideKey === "paid" ? "Several people paid" : "Split it differently"}
      </Option>
      {custom && (
        <div className="flex flex-col gap-2 rounded-xl border p-3">
          <div className="flex gap-1">
            {MODES.map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={side.mode === mode ? "default" : "outline"}
                onClick={() => draft.setMode(sideKey, mode)}
              >
                {MODE_LABELS[mode]}
              </Button>
            ))}
          </div>
          {draft.members.map((id) => (
            <div key={id} className="flex items-center gap-2">
              <span className="flex-1">
                {memberName(id)}
                {MEMBERS.find((m) => m.id === id)?.former && " (former)"}
              </span>
              {side.mode === "equal" && (
                <Button
                  size="sm"
                  variant={side.ticked.includes(id) ? "default" : "outline"}
                  onClick={() => draft.toggle(sideKey, id)}
                >
                  {side.ticked.includes(id) ? "In" : "Out"}
                </Button>
              )}
              {side.mode === "exact" && (
                <AmountInput
                  className="w-28 text-right"
                  aria-label={memberName(id)}
                  value={side.exact[id] ?? null}
                  onValueChange={(cents) => draft.setExact(sideKey, id, cents)}
                  placeholder="0.00"
                />
              )}
              {side.mode === "percent" && (
                <Input
                  className="w-20 text-right"
                  inputMode="decimal"
                  aria-label={`${memberName(id)} percent`}
                  value={side.percent[id] ?? ""}
                  onChange={(event) => draft.setPercent(sideKey, id, event.target.value)}
                  placeholder="0%"
                />
              )}
              {side.mode !== "exact" && (
                <span className="w-20 text-right text-sm text-muted-foreground tabular-nums">
                  {result.shares[id] ? format(result.shares[id]) : "–"}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {/* The live tally sits where the thumb is, above the Next button. */}
      <div
        className={cn(
          "sticky bottom-16 rounded-lg px-3 py-2 text-center text-sm font-medium",
          result.problem
            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
        )}
      >
        {result.status} · total {format(draft.total ?? 0)}
      </div>
    </div>
  )
}

function Option({
  selected,
  onClick,
  children,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-left",
        selected && "border-primary ring-2 ring-primary/30",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border",
          selected && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {selected && <CheckIcon className="size-3" />}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  )
}

function Review({
  draft,
  expense,
  goTo,
}: {
  draft: ExpenseDraft
  expense: Expense | null
  goTo: (step: number) => void
}) {
  const line = (label: string, step: number, body: React.ReactNode) => (
    <div className="flex items-start gap-2 border-b py-2 last:border-0">
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div>{body}</div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Change ${label}`}
        onClick={() => goTo(step)}
      >
        <PencilIcon />
      </Button>
    </div>
  )
  return (
    <div className="flex flex-col rounded-xl border px-3">
      {line(
        "What",
        0,
        <>
          <span className="font-medium">{draft.description || "—"}</span> ·{" "}
          {format(draft.total ?? 0)}
          {draft.isRefund && " (Refund)"}
          <div className="text-xs text-muted-foreground">
            {categoryName(draft.categoryId)} · {formatDisplayDate(draft.date)}
            {draft.note && ` · ${draft.note}`}
          </div>
        </>,
      )}
      {line("Paid", 1, describeShares(draft.paid.shares))}
      {line("Owed", 2, describeShares(draft.owed.shares))}
      {draft.problems.length > 0 && (
        <ul className="py-2 text-sm text-destructive">
          {draft.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {expense && (
        <p className="py-2 text-xs text-muted-foreground">
          Added by {memberName(expense.addedBy)} · last changed by {memberName(expense.changedBy)}
        </p>
      )}
    </div>
  )
}

function PaymentPage({
  store,
  payment,
  onDone,
}: {
  store: Store
  payment: Payment | null
  onDone: () => void
}) {
  const draft = usePaymentDraft(store, payment)
  const people = (value: string, onPick: (id: string) => void) => (
    <div className="grid grid-cols-4 gap-2">
      {MEMBERS.map((member) => (
        <button
          key={member.id}
          type="button"
          onClick={() => onPick(member.id)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border p-2 text-sm",
            value === member.id && "border-primary ring-2 ring-primary/30",
          )}
        >
          <span className="grid size-10 place-items-center rounded-full bg-muted text-base font-semibold">
            {member.name[0]}
          </span>
          {member.name}
          <span className="text-[10px] text-muted-foreground">
            {member.former ? "former · " : ""}
            {format(store.balances[member.id] ?? 0, { sign: "always" })}
          </span>
        </button>
      ))}
    </div>
  )
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onDone}>
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-lg font-semibold">{payment ? "Edit Payment" : "Settle up"}</h1>
      </div>
      <div className="text-sm font-medium">Who's paying?</div>
      {people(draft.fromId, draft.setFromId)}
      <div className="text-sm font-medium">Who gets it?</div>
      {people(draft.toId, draft.setToId)}
      <AmountInput
        className="h-16 text-center text-3xl"
        aria-label="Amount"
        value={draft.amount}
        onValueChange={draft.setAmount}
        placeholder="$0.00"
      />
      <Input
        type="date"
        aria-label="Date"
        value={draft.date}
        onChange={(event) => draft.setDate(event.target.value)}
      />
      <Input
        aria-label="Note"
        value={draft.note}
        onChange={(event) => draft.setNote(event.target.value)}
        placeholder="Note: settling up, or a loan for…"
      />
      <p className="rounded-lg bg-muted p-3 text-sm">
        {memberName(draft.fromId)} pays {memberName(draft.toId)} {format(draft.amount ?? 0)}.
      </p>
      {draft.problems.length > 0 && <p className="text-sm text-destructive">{draft.problems[0]}</p>}
      <Button
        size="lg"
        className="h-12"
        disabled={draft.problems.length > 0}
        onClick={() => draft.save() && onDone()}
      >
        <CheckIcon /> {payment ? "Save changes" : "Record Payment"}
      </Button>
      {payment && (
        <DeleteButton
          onDelete={() => {
            store.remove(payment.id)
            onDone()
          }}
        />
      )}
    </div>
  )
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <Button variant="destructive" size="lg" onClick={() => (armed ? onDelete() : setArmed(true))}>
      {armed ? "Tap again to delete for good" : "Delete"}
    </Button>
  )
}

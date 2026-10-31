import { cn } from "cn"
import { ArrowLeftIcon, CheckIcon, PencilIcon } from "lucide-react"
import { useState } from "react"
import { people, sideWords } from "@/apps/split/words"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Category, Member } from "@/data/split"
import { formatDisplayDate } from "@shared/dates"
import { format } from "@shared/money"
import { defaultCategory } from "@shared/split/categories"
import { equalSide, resolveExpense, resolveSide, type ExpenseField } from "@shared/split/rules"
import type { CreateExpense } from "@shared/split/schemas"

/** A new Expense as the flow hands it over; the caller gives it its id. */
export type NewExpense = Omit<CreateExpense, "id">

type ExpenseFlowProps = {
  viewerId: string
  /** The Members who can be on a new Expense, oldest Account first. */
  members: readonly Member[]
  /** The Categories offered: those not archived. */
  categories: readonly Category[]
  /** The household's date today, the date a new Expense starts on. */
  today: string
  /** Saves the Expense; resolves true once stored. */
  onSave: (expense: NewExpense) => Promise<boolean>
  onCancel: () => void
}

const STEPS = ["What", "Who paid", "Who owes", "Review"] as const

/** Which fields each step asks for, so Next waits until they're valid. */
const STEP_FIELDS: readonly (readonly ExpenseField[])[] = [
  ["description", "date", "total"],
  ["paid"],
  ["owed"],
  ["description", "date", "total", "paid", "owed"],
]

/**
 * Adding an Expense, full page, in four steps: What → Who paid → Who owes → Review. The step bar
 * jumps back to any step already reached, and Next waits until the step is valid. Who paid and
 * Who owes take one-tap answers: one Member paid it all, and everyone or only one Member owes it,
 * equally.
 */
export function ExpenseFlow({
  viewerId,
  members,
  categories,
  today,
  onSave,
  onCancel,
}: ExpenseFlowProps) {
  const [step, setStep] = useState(0)
  const [reached, setReached] = useState(0)
  const [total, setTotal] = useState<number | null>(null)
  const [description, setDescription] = useState("")
  const [date, setDate] = useState(today)
  const [categoryId, setCategoryId] = useState(defaultCategory(categories)?.id ?? "")
  const [note, setNote] = useState("")
  const [paidBy, setPaidBy] = useState(viewerId)
  // The one-tap answers to "Who owes": everyone (null) or only one Member.
  const [owedBy, setOwedBy] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const order = members.map((member) => member.id)
  const who = people(viewerId, members)
  const expense: NewExpense = {
    description,
    date,
    categoryId,
    total: total ?? 0,
    note,
    paid: equalSide([paidBy]),
    owed: equalSide(owedBy === null ? order : [owedBy]),
  }
  const resolution = resolveExpense(expense, order)
  const problems = resolution.ok ? [] : resolution.problems
  const stepValid = (index: number) =>
    !problems.some((problem) => STEP_FIELDS[index]?.includes(problem.field)) &&
    (index !== 0 || categoryId !== "")
  // The viewer first, then everyone else oldest Account first.
  const answers = [
    ...members.filter((member) => member.id === viewerId),
    ...members.filter((member) => member.id !== viewerId),
  ]
  /** One side on Review, in words even while another field still blocks the save. */
  const sideLine = (key: "paid" | "owed") => {
    const side = resolveSide(expense.total, expense[key], order)
    return side.ok ? sideWords(side.shares, key === "paid" ? "paid" : "owe", who) : side.problem
  }

  function goTo(index: number) {
    setStep(index)
    setReached((was) => Math.max(was, index))
  }

  /** On success the caller leaves the flow; a refusal (already reported) stays on Review. */
  async function save() {
    if (!resolution.ok || saving) return
    setSaving(true)
    await onSave({ ...expense, description: description.trim(), note: note.trim() })
    setSaving(false)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={step === 0 ? "Cancel" : "Back"}
          onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-lg font-semibold">New Expense</h1>
      </div>
      <nav aria-label="Steps">
        <ol className="grid grid-cols-4 gap-1 text-center text-xs">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={index > reached}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
                className={cn(
                  "w-full border-t-4 pt-1 disabled:text-muted-foreground",
                  index === step
                    ? "border-primary font-medium"
                    : index <= reached
                      ? "border-primary/40"
                      : "border-muted",
                )}
              >
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {step === 0 && (
        <div className="flex flex-col gap-4">
          <AmountInput
            className="h-16 text-center text-3xl"
            aria-label="Total"
            value={total}
            onValueChange={setTotal}
            placeholder="$0.00"
          />
          <Input
            aria-label="Description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What was it for?"
          />
          <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                role="radio"
                aria-checked={categoryId === category.id}
                onClick={() => setCategoryId(category.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  categoryId === category.id && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
          <Input
            type="date"
            aria-label="Date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Textarea
            aria-label="Note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note (optional)"
          />
        </div>
      )}

      {step === 1 && (
        <Question title="Who paid?">
          {answers.map((member) => (
            <Answer
              key={member.id}
              selected={paidBy === member.id}
              onSelect={() => setPaidBy(member.id)}
            >
              {who.nameOf(member.id)} paid it all
            </Answer>
          ))}
        </Question>
      )}

      {step === 2 && (
        <Question title="Who owes for it?">
          <Answer selected={owedBy === null} onSelect={() => setOwedBy(null)}>
            Everyone equally
          </Answer>
          {answers.map((member) => (
            <Answer
              key={member.id}
              selected={owedBy === member.id}
              onSelect={() => setOwedBy(member.id)}
            >
              Only {member.id === viewerId ? "you" : member.name}
            </Answer>
          ))}
        </Question>
      )}

      {step === 3 && (
        <div className="flex flex-col rounded-xl border px-3">
          <ReviewLine label="What" onChange={() => setStep(0)}>
            <span className="font-medium">{description.trim() || "No description"}</span> ·{" "}
            {format(total ?? 0)}
            <div className="text-xs text-muted-foreground">
              {categories.find((category) => category.id === categoryId)?.name ?? "No Category"} ·{" "}
              {date === "" ? "No date" : formatDisplayDate(date)}
              {note.trim() !== "" && ` · ${note.trim()}`}
            </div>
          </ReviewLine>
          <ReviewLine label="Paid" onChange={() => setStep(1)}>
            {sideLine("paid")}
          </ReviewLine>
          <ReviewLine label="Owed" onChange={() => setStep(2)}>
            {sideLine("owed")}
          </ReviewLine>
          {problems.length > 0 && (
            <ul aria-label="Still to fix" className="py-2 text-sm text-destructive">
              {problems.map((problem) => (
                <li key={problem.field}>{problem.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {step < 3 ? (
        <Button
          size="lg"
          className="h-12"
          disabled={!stepValid(step)}
          onClick={() => goTo(step + 1)}
        >
          Next
        </Button>
      ) : (
        <Button
          size="lg"
          className="h-12"
          disabled={!resolution.ok || saving}
          onClick={() => void save()}
        >
          <CheckIcon /> Add Expense
        </Button>
      )}
    </div>
  )
}

function Question({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="radiogroup" aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-base font-medium">{title}</h2>
      {children}
    </div>
  )
}

function Answer({
  selected,
  onSelect,
  children,
}: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
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

function ReviewLine({
  label,
  onChange,
  children,
}: {
  label: string
  onChange: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-2 border-b py-2 last:border-0">
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div>{children}</div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Change ${label}`} onClick={onChange}>
        <PencilIcon />
      </Button>
    </div>
  )
}

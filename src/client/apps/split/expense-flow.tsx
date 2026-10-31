import { cn } from "cn"
import { ArrowLeftIcon, CheckIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { EntryNoticeLine, type EntryNotice } from "@/apps/split/entry-form"
import {
  authorshipWords,
  expenseSideWords,
  magnitudes,
  people,
  type People,
} from "@/apps/split/words"
import { AmountInput } from "@/components/amount-input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { Category, Expense, Member } from "@/data/split"
import { formatDisplayDate } from "@shared/dates"
import { format } from "@shared/money"
import { defaultCategory } from "@shared/split/categories"
import {
  editExpenseRoster,
  equalSide,
  newExpenseRoster,
  resolveExpense,
  resolveSide,
  type ExpenseField,
  type Roster,
} from "@shared/split/rules"
import { SPLIT_MODES, type CreateExpense, type Side, type SplitMode } from "@shared/split/schemas"

/** An Expense as the flow hands it over; the caller gives a new one its id. */
export type NewExpense = Omit<CreateExpense, "id">

/** Whether a side is the one-tap answer "only this Member", equally. */
function only(side: Side, memberId: string): boolean {
  return side.mode === "equal" && side.ticked.length === 1 && side.ticked[0] === memberId
}

/** Whether a side is the one-tap answer "everyone equally". */
function everyone(side: Side, order: readonly string[]): boolean {
  return (
    side.mode === "equal" &&
    side.ticked.length === order.length &&
    order.every((id) => side.ticked.includes(id))
  )
}

type ExpenseFlowProps = {
  viewerId: string
  /** The Members who can be newly added to the Expense, oldest Account first. */
  members: readonly Member[]
  /** The Categories offered: those not archived, and the one an edited Expense already has. */
  categories: readonly Category[]
  /** The household's date today, the date a new Expense starts on. */
  today: string
  /** Saves the Expense; resolves true when the flow closes. */
  onSave: (expense: NewExpense) => Promise<boolean>
  onCancel: () => void
  /** A newer version saved by someone else, or a save that didn't reach the server. */
  notice?: EntryNotice | null
  /**
   * The saved Expense being changed, absent when adding one. It opens on Review as it was
   * entered, each step returns to Review, and Review offers `onDelete`.
   */
  editing?: { expense: Expense; onDelete: () => void }
}

const STEPS = ["What", "Who paid", "Who owes", "Review"] as const
const REVIEW = STEPS.length - 1

type SideKey = "paid" | "owed"

const MODE_LABELS: Record<SplitMode, string> = {
  equal: "Equally",
  exact: "Exact $",
  percent: "Percent",
}

/** Whether a side is one of its question's one-tap answers, rather than the full editor's. */
function oneTap(key: SideKey, side: Side, order: readonly string[]): boolean {
  return order.some((id) => only(side, id)) || (key === "owed" && everyone(side, order))
}

/** Which fields each step asks for, so Next waits until they're valid. */
const STEP_FIELDS: readonly (readonly ExpenseField[])[] = [
  ["description", "date", "total"],
  ["paid"],
  ["owed"],
  ["description", "date", "total", "paid", "owed"],
]

/**
 * Adding or changing an Expense, full page, in four steps: What → Who paid → Who owes → Review.
 * The step bar jumps back to any step already reached, and Next waits until the step is valid.
 * Who paid and Who owes take one-tap answers (one Member paid it all; everyone or only one Member
 * owes it, equally), or open a full editor for the side with its own Split mode. A saved Expense
 * keeps each side as it was entered, reopening in the editor when no one-tap answer matches it.
 * A negative total is a Refund, and the questions say so.
 */
export function ExpenseFlow({
  viewerId,
  members,
  categories,
  today,
  onSave,
  onCancel,
  notice,
  editing,
}: ExpenseFlowProps) {
  const saved = editing?.expense
  const order = members.map((member) => member.id)
  const [step, setStep] = useState(saved ? REVIEW : 0)
  const [reached, setReached] = useState(saved ? REVIEW : 0)
  const [total, setTotal] = useState<number | null>(saved?.total ?? null)
  const [description, setDescription] = useState(saved?.description ?? "")
  const [date, setDate] = useState(saved?.date ?? today)
  const [categoryId, setCategoryId] = useState(
    saved?.categoryId ?? defaultCategory(categories)?.id ?? "",
  )
  const [note, setNote] = useState(saved?.note ?? "")
  const [paid, setPaid] = useState<Side>(saved?.paid ?? equalSide([viewerId]))
  const [owed, setOwed] = useState<Side>(saved?.owed ?? equalSide(order))
  // Whether each side's full editor is the answer: a saved side that no one-tap answer matches
  // reopens in it, in the Split mode and inputs it was entered with.
  const [inEditor, setInEditor] = useState<Record<SideKey, boolean>>(() => ({
    paid: saved !== undefined && !oneTap("paid", saved.paid, order),
    owed: saved !== undefined && !oneTap("owed", saved.owed, order),
  }))
  // What the editor held when a one-tap answer replaced it, so reopening it brings that back.
  const [stashed, setStashed] = useState<Record<SideKey, Side | null>>({
    paid: null,
    owed: null,
  })
  const [saving, setSaving] = useState(false)
  // Deleting takes a second tap; leaving Review disarms it.
  const [deleteArmed, setDeleteArmed] = useState(false)

  const roster = saved ? editExpenseRoster(order, order, saved) : newExpenseRoster(order)
  const who = people(viewerId, members)
  const isRefund = (total ?? 0) < 0
  const expense: NewExpense = { description, date, categoryId, total: total ?? 0, note, paid, owed }
  const sides = { paid, owed }
  // The side the current step asks about, if any.
  const asking: SideKey | null = step === 1 ? "paid" : step === 2 ? "owed" : null
  const setSide = (key: SideKey, side: Side) => (key === "paid" ? setPaid(side) : setOwed(side))
  const resolution = resolveExpense(expense, roster)
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
  const sideLine = (key: SideKey) => {
    const side = resolveSide(expense.total, expense[key], roster)
    return side.ok ? expenseSideWords(expense.total, side.shares, key, who) : side.problem
  }

  /** Picks a one-tap answer, keeping what the editor held in case it is reopened. */
  function pick(key: SideKey, side: Side) {
    if (inEditor[key]) setStashed((was) => ({ ...was, [key]: sides[key] }))
    setInEditor((was) => ({ ...was, [key]: false }))
    setSide(key, side)
  }

  /** Opens a side's full editor, on what it held before or else the side as it stands. */
  function openEditor(key: SideKey) {
    if (inEditor[key]) return
    const held = stashed[key]
    if (held) setSide(key, held)
    setInEditor((was) => ({ ...was, [key]: true }))
  }

  function goTo(index: number) {
    setStep(index)
    setReached((was) => Math.max(was, index))
    setDeleteArmed(false)
  }

  // Changing a saved Expense, every step returns to Review, and Review's way back leaves.
  const leavesOnBack = step === 0 || (saved !== undefined && step === REVIEW)
  function back() {
    if (leavesOnBack) onCancel()
    else goTo(saved ? REVIEW : step - 1)
  }

  /**
   * On success the caller leaves the flow; a refusal (already reported), or a save that never
   * reached the server, stays on Review with everything kept.
   */
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
          aria-label={leavesOnBack ? "Cancel" : "Back"}
          onClick={back}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="text-lg font-semibold">{saved ? "Edit Expense" : "New Expense"}</h1>
      </div>
      <nav aria-label="Steps">
        <ol className="grid grid-cols-4 gap-1 text-center text-xs">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={index > reached}
                aria-current={index === step ? "step" : undefined}
                onClick={() => goTo(index)}
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
          {isRefund && (
            <p className="text-center text-sm text-muted-foreground">
              A negative total is a Refund: money given back.
            </p>
          )}
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
        <Question title={isRefund ? "Who got the money back?" : "Who paid?"}>
          {answers.map((member) => (
            <Answer
              key={member.id}
              selected={!inEditor.paid && only(paid, member.id)}
              onSelect={() => pick("paid", equalSide([member.id]))}
            >
              {who.nameOf(member.id)} {isRefund ? "got it all back" : "paid it all"}
            </Answer>
          ))}
          <Answer selected={inEditor.paid} onSelect={() => openEditor("paid")}>
            {isRefund ? "Several people got it back" : "Several people paid"}
          </Answer>
        </Question>
      )}

      {step === 2 && (
        <Question title={isRefund ? "Who shares the Refund?" : "Who owes for it?"}>
          <Answer
            selected={!inEditor.owed && everyone(owed, order)}
            onSelect={() => pick("owed", equalSide(order))}
          >
            Everyone equally
          </Answer>
          {answers.map((member) => (
            <Answer
              key={member.id}
              selected={!inEditor.owed && only(owed, member.id)}
              onSelect={() => pick("owed", equalSide([member.id]))}
            >
              Only {who.nameOf(member.id, "within")}
            </Answer>
          ))}
          <Answer selected={inEditor.owed} onSelect={() => openEditor("owed")}>
            Split it differently
          </Answer>
        </Question>
      )}

      {asking !== null && inEditor[asking] && (
        <SideEditor
          label={asking === "paid" ? "Paid side" : "Owed side"}
          total={expense.total}
          side={sides[asking]}
          roster={roster}
          rows={answers.map((member) => member.id)}
          who={who}
          onChange={(side) => setSide(asking, side)}
        />
      )}

      {step === REVIEW && (
        <div className="flex flex-col rounded-xl border px-3">
          <ReviewLine label="What" onChange={() => goTo(0)}>
            <span className="font-medium">{description.trim() || "No description"}</span> ·{" "}
            <span>
              {format(total ?? 0)}
              {isRefund && " (Refund)"}
            </span>
            <div className="text-xs text-muted-foreground">
              {categories.find((category) => category.id === categoryId)?.name ?? "No Category"} ·{" "}
              {date === "" ? "No date" : formatDisplayDate(date)}
              {note.trim() !== "" && ` · ${note.trim()}`}
            </div>
          </ReviewLine>
          <ReviewLine label="Paid" onChange={() => goTo(1)}>
            {sideLine("paid")}
          </ReviewLine>
          <ReviewLine label="Owed" onChange={() => goTo(2)}>
            {sideLine("owed")}
          </ReviewLine>
          {problems.length > 0 && (
            <ul aria-label="Still to fix" className="py-2 text-sm text-destructive">
              {problems.map((problem) => (
                <li key={problem.field}>
                  {problem.field === "paid" && "Paid: "}
                  {problem.field === "owed" && "Owed: "}
                  {problem.message}
                </li>
              ))}
            </ul>
          )}
          {saved && (
            <p className="border-t py-2 text-xs text-muted-foreground">
              {authorshipWords(saved, who)}
            </p>
          )}
        </div>
      )}

      {/* Steps work offline, so a failed save is told, with Try again, only on Review. */}
      {notice && (notice.kind === "newer" || step === REVIEW) && (
        <EntryNoticeLine notice={notice} who={who} onRetry={() => void save()} />
      )}
      {step < REVIEW ? (
        <Button
          size="lg"
          className="h-12"
          disabled={!stepValid(step)}
          onClick={() => goTo(saved ? REVIEW : step + 1)}
        >
          {saved ? "Done" : "Next"}
        </Button>
      ) : (
        <Button
          size="lg"
          className="h-12"
          disabled={!resolution.ok || saving}
          onClick={() => void save()}
        >
          <CheckIcon /> {saved ? "Save changes" : "Add Expense"}
        </Button>
      )}
      {editing && step === REVIEW && (
        <Button
          variant={deleteArmed ? "destructive" : "ghost"}
          className={cn(!deleteArmed && "text-destructive")}
          disabled={saving}
          onClick={() => (deleteArmed ? editing.onDelete() : setDeleteArmed(true))}
        >
          <Trash2Icon /> {deleteArmed ? "Tap again to delete for good" : "Delete Expense"}
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

/**
 * One side's full editor: its Split mode, a row per Member, and a live tally that is green once the
 * side adds up to the total and amber until then. Switching to Exact $ starts from the cents the
 * side comes to now when it adds up, replacing any amounts typed before; otherwise, and for the
 * other modes, the inputs typed for that mode are kept.
 */
function SideEditor({
  label,
  total,
  side,
  roster,
  rows,
  who,
  onChange,
}: {
  label: string
  total: number
  side: Side
  roster: Roster
  /** The Members offered, in the order shown. */
  rows: readonly string[]
  who: People
  onChange: (side: Side) => void
}) {
  const result = resolveSide(total, side, roster)
  const shares = result.ok ? result.shares : {}

  function setMode(mode: SplitMode) {
    if (mode === side.mode) return
    // Exact $ starts from the current cents, as amounts: a Refund's are typed without a minus.
    const current = result.ok ? magnitudes(result.shares) : side.exact
    onChange({ ...side, mode, exact: mode === "exact" ? current : side.exact })
  }

  function toggle(id: string, ticked: boolean) {
    const others = side.ticked.filter((member) => member !== id)
    onChange({ ...side, ticked: ticked ? [...others, id] : others })
  }

  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-xl border p-3">
      <div role="radiogroup" aria-label="Split mode" className="flex gap-1.5">
        {SPLIT_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={side.mode === mode}
            onClick={() => setMode(mode)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              side.mode === mode && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>
      {rows.map((id) => {
        const share = shares[id]
        return (
          <div key={id} className="flex min-h-9 items-center gap-2">
            {side.mode === "equal" ? (
              <label className="flex flex-1 items-center gap-2">
                <Checkbox
                  aria-label={who.nameOf(id)}
                  checked={side.ticked.includes(id)}
                  onCheckedChange={(checked) => toggle(id, checked)}
                />
                {who.nameOf(id)}
              </label>
            ) : (
              <span className="flex-1">{who.nameOf(id)}</span>
            )}
            {side.mode === "exact" && (
              <AmountInput
                className="w-28 text-right"
                aria-label={`Amount for ${who.nameOf(id, "within")}`}
                value={side.exact[id] ?? null}
                onValueChange={(cents) =>
                  onChange({ ...side, exact: { ...side.exact, [id]: cents } })
                }
                placeholder="$0.00"
              />
            )}
            {side.mode === "percent" && (
              <Input
                className="w-20 text-right"
                inputMode="decimal"
                autoComplete="off"
                aria-label={`Percent for ${who.nameOf(id, "within")}`}
                value={side.percent[id] ?? ""}
                onChange={(event) =>
                  onChange({ ...side, percent: { ...side.percent, [id]: event.target.value } })
                }
                placeholder="0%"
              />
            )}
            {side.mode !== "exact" && (
              <span className="w-20 text-right text-sm text-muted-foreground tabular-nums">
                {share === undefined ? "–" : format(share)}
              </span>
            )}
          </div>
        )
      })}
      <div
        role="status"
        aria-label="Tally"
        data-balanced={result.ok}
        className={cn(
          "sticky bottom-2 rounded-lg px-3 py-2 text-center text-sm font-medium",
          result.ok
            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
            : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        )}
      >
        {result.status}
      </div>
    </section>
  )
}

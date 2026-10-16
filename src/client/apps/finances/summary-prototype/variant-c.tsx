// PROTOTYPE, throw away. Variant C: an income statement. A month dropdown and one "compare to"
// switch (last month or 12-month average) give a single comparison column with the change; Income
// and Spending sections carry subtotals down to Net. A row opens a side sheet of its Actuals where
// each one can be recategorised. Categories are managed on their own tab.
import { useState } from "react"
import {
  actualsIn,
  addMonths,
  CATEGORIES,
  FIRST_MONTH,
  monthLabel,
  summary,
  THIS_MONTH,
  type Line,
} from "@/apps/finances/summary-prototype/data"
import { Amount, Pill, stub } from "@/apps/finances/home-prototype/shared"
import { shortDate } from "@/apps/finances/home-prototype/data"
import { format } from "@shared/money"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "cn"

type Compare = "last" | "avg"

export function VariantC() {
  const [tab, setTab] = useState<"summary" | "categories">("summary")
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      <div className="grid grid-cols-2 rounded-lg border p-0.5 text-sm">
        {(["summary", "categories"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "h-10 rounded-md capitalize",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {t === "summary" ? "Monthly summary" : "Categories"}
          </button>
        ))}
      </div>
      {tab === "summary" ? <Statement /> : <CategoryList />}
    </div>
  )
}

function Statement() {
  const [month, setMonth] = useState(addMonths(THIS_MONTH, -1))
  const [compare, setCompare] = useState<Compare>("avg")
  const [open, setOpen] = useState<Line | null>(null)
  const s = summary(month)
  const then = compare === "last" ? s.lastMonth : s.average
  const pick = (l: Line) => (compare === "last" ? l.lastMonth : l.average)

  const months: string[] = []
  for (let m = THIS_MONTH; m >= FIRST_MONTH; m = addMonths(m, -1)) months.push(m)

  const income = s.lines.filter((l) => l.cents > 0 || (l.cents === 0 && l.average > 0))
  const spending = s.lines.filter((l) => !income.includes(l))

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-md border bg-background px-2 text-base font-semibold"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
              {m === THIS_MONTH ? " (so far)" : ""}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground">compare to</span>
        <div className="inline-flex rounded-lg border p-0.5 text-sm">
          {(
            [
              ["last", "Last month"],
              ["avg", "12-mo avg"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setCompare(k)}
              className={cn(
                "h-9 rounded-md px-2",
                compare === k ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border text-sm">
        <Header compare={compare} month={month} />
        <SectionTitle>Income</SectionTitle>
        {income.map((l) => (
          <Row key={l.category ?? "none"} line={l} then={pick(l)} onClick={() => setOpen(l)} />
        ))}
        <Subtotal label="Total income" now={s.totals.income} then={then.income} />
        <SectionTitle>Spending</SectionTitle>
        {spending.map((l) => (
          <Row key={l.category ?? "none"} line={l} then={pick(l)} onClick={() => setOpen(l)} />
        ))}
        <Subtotal label="Total spending" now={s.totals.spending} then={then.spending} />
        <Subtotal label="Net" now={s.totals.net} then={then.net} strong />
      </div>

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="overflow-y-auto">
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {open.name} · {monthLabel(month)}
                </SheetTitle>
              </SheetHeader>
              <ul className="divide-y px-4 text-sm">
                {actualsIn(month, open.category).map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{a.label}</span>
                      <Amount cents={a.cents} />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {shortDate(a.date)} · {a.wallet}
                      </span>
                      <select
                        defaultValue={a.category ?? ""}
                        onChange={stub(`recategorise ${a.id}`)}
                        className="h-8 rounded border bg-background px-1"
                      >
                        <option value="">Uncategorised</option>
                        {CATEGORIES.filter((c) => !c.archived || c.id === a.category).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}

const GRID = "grid grid-cols-[1fr_6.5rem_6.5rem_5.5rem] items-center gap-2 px-3"

function Header({ compare, month }: { compare: Compare; month: string }) {
  return (
    <div className={cn(GRID, "border-b py-2 text-xs text-muted-foreground")}>
      <span />
      <span className="text-right">{monthLabel(month, "short")}</span>
      <span className="text-right">{compare === "last" ? "Last month" : "12-mo avg"}</span>
      <span className="text-right">Change</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-muted/50 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  )
}

function Change({ now, then }: { now: number; then: number }) {
  const diff = now - then
  return (
    <span
      className={cn(
        "text-right text-xs tabular-nums",
        diff > 0
          ? "text-emerald-700 dark:text-emerald-400"
          : diff < 0
            ? "text-rose-600"
            : "text-muted-foreground",
      )}
    >
      {diff === 0 ? "—" : format(diff, { sign: "always" })}
    </span>
  )
}

function Row({ line, then, onClick }: { line: Line; then: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(GRID, "w-full py-2 text-left hover:bg-muted/50")}
    >
      <span className={cn("truncate", line.category === null && "italic")}>
        {line.name} {line.archived && <Pill tone="muted">archived</Pill>}
      </span>
      <Amount cents={line.cents} className="text-right" />
      <Amount cents={then} className="text-right text-muted-foreground" />
      <Change now={line.cents} then={then} />
    </button>
  )
}

function Subtotal({
  label,
  now,
  then,
  strong,
}: {
  label: string
  now: number
  then: number
  strong?: boolean
}) {
  return (
    <div className={cn(GRID, "border-t py-2", strong ? "text-base font-semibold" : "font-medium")}>
      <span>{label}</span>
      <Amount cents={now} className="text-right" />
      <Amount cents={then} className="text-right text-muted-foreground" />
      <Change now={now} then={then} />
    </div>
  )
}

function CategoryList() {
  const active = CATEGORIES.filter((c) => !c.archived)
  const archived = CATEGORIES.filter((c) => c.archived)
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categories</h1>
        <Button size="sm" onClick={stub("add category")}>
          Add
        </Button>
      </div>
      <ul className="divide-y rounded-xl border text-sm">
        {active.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <span className="flex-1">{c.name}</span>
            <select
              defaultValue=""
              onChange={stub(`merge ${c.name}`)}
              className="h-8 rounded border bg-background px-1 text-xs"
            >
              <option value="" disabled>
                Merge into…
              </option>
              {active
                .filter((o) => o.id !== c.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
            <Button size="sm" variant="ghost" onClick={stub(`rename ${c.name}`)}>
              Rename
            </Button>
            <Button size="sm" variant="ghost" onClick={stub(`archive ${c.name}`)}>
              Archive
            </Button>
          </li>
        ))}
      </ul>
      <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
      <ul className="divide-y rounded-xl border text-sm opacity-70">
        {archived.map((c) => (
          <li key={c.id} className="flex items-center gap-2 px-3 py-2">
            <span className="flex-1">{c.name}</span>
            <Button size="sm" variant="ghost" onClick={stub(`unarchive ${c.name}`)}>
              Unarchive
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}

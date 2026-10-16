// PROTOTYPE, throw away. Variant B: bars against the average. A 12-month net chart doubles as the
// month picker; each Category is a bar for the month with a tick at its 12-month average and a
// note on last month. A Category opens its own page: a year of bars, its Actuals, and the
// rename, merge and archive actions.
import { ArrowLeftIcon } from "lucide-react"
import { useState } from "react"
import {
  actualsIn,
  addMonths,
  FIRST_MONTH,
  monthLabel,
  summary,
  THIS_MONTH,
  type CategoryId,
  type Line,
} from "@/apps/finances/summary-prototype/data"
import { Amount, Pill, stub } from "@/apps/finances/home-prototype/shared"
import { shortDate } from "@/apps/finances/home-prototype/data"
import { format } from "@shared/money"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

export function VariantB() {
  const [month, setMonth] = useState(addMonths(THIS_MONTH, -1))
  const [open, setOpen] = useState<CategoryId | null | undefined>(undefined)
  const s = summary(month)

  if (open !== undefined) {
    const line = s.lines.find((l) => l.category === open)
    if (line) return <CategoryPage line={line} month={month} back={() => setOpen(undefined)} />
  }

  // The picker always shows the 12 months ending at this month, or at the chosen one if older.
  const end = month < addMonths(THIS_MONTH, -11) ? addMonths(month, 11) : THIS_MONTH
  const strip = summary(end).netTrend.filter((m) => m.month >= FIRST_MONTH)
  const peak = Math.max(...strip.map((m) => Math.max(m.income, -m.spending)), 1)

  const income = s.lines.filter((l) => l.cents > 0 || (l.cents === 0 && l.average > 0))
  const spending = s.lines.filter((l) => !income.includes(l))
  const spendPeak = Math.max(
    ...spending.map((l) => Math.max(-l.cents, -l.average, -l.lastMonth)),
    1,
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-24">
      <section>
        <div className="flex h-32 items-center gap-1">
          {strip.map((m) => (
            <button
              key={m.month}
              type="button"
              onClick={() => setMonth(m.month)}
              className={cn(
                "flex h-full flex-1 flex-col items-center justify-center rounded-md",
                m.month === month ? "bg-muted ring-2 ring-primary" : "hover:bg-muted/50",
              )}
              aria-label={monthLabel(m.month)}
            >
              <div className="flex h-1/2 w-3 items-end">
                <div
                  className="w-full rounded-t bg-emerald-500"
                  style={{ height: `${(m.income / peak) * 100}%` }}
                />
              </div>
              <div className="flex h-1/2 w-3 items-start">
                <div
                  className="w-full rounded-b bg-rose-400"
                  style={{ height: `${(-m.spending / peak) * 100}%` }}
                />
              </div>
            </button>
          ))}
        </div>
        <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground">
          {strip.map((m) => (
            <span key={m.month} className="flex-1 text-center">
              {monthLabel(m.month, "short").split(" ")[0]}
            </span>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs">
          <button
            type="button"
            className="text-muted-foreground underline"
            disabled={month <= FIRST_MONTH}
            onClick={() => setMonth(addMonths(month, -12))}
          >
            Earlier year
          </button>
        </div>
      </section>

      <section>
        <h1 className="text-xl font-semibold">
          {monthLabel(month)}
          {month === THIS_MONTH && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">so far</span>
          )}
        </h1>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["income", "spending", "net"] as const).map((k) => (
            <div key={k} className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground capitalize">{k}</p>
              <Amount cents={s.totals[k]} className="text-lg font-semibold" />
              <Delta now={s.totals[k]} then={s.average[k]} label="avg" />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Income</h2>
        <ul className="flex flex-col gap-1">
          {income.map((l) => (
            <li key={l.category ?? "none"}>
              <button
                type="button"
                onClick={() => setOpen(l.category)}
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-muted/50"
              >
                <span>{l.name}</span>
                <span className="text-right text-sm">
                  <Amount cents={l.cents} className="font-medium" />
                  <Delta now={l.cents} then={l.average} label="avg" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
          <h2 className="font-medium">Spending</h2>
          <span className="flex items-center gap-1 text-xs">
            <span className="inline-block h-3 w-0.5 bg-foreground" /> 12-mo avg
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {spending.map((l) => (
            <li key={l.category ?? "none"}>
              <button
                type="button"
                onClick={() => setOpen(l.category)}
                className="w-full rounded-md px-2 py-2 text-left hover:bg-muted/50"
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className={cn(l.category === null && "italic")}>
                    {l.name} {l.archived && <Pill tone="muted">archived</Pill>}
                  </span>
                  <Amount cents={l.cents} className="font-medium" />
                </div>
                <div className="relative mt-1 h-3 rounded bg-muted">
                  <div
                    className={cn(
                      "h-full rounded",
                      -l.cents > -l.average * 1.15 ? "bg-rose-500" : "bg-sky-500",
                    )}
                    style={{ width: `${Math.max(0, (-l.cents / spendPeak) * 100)}%` }}
                  />
                  <div
                    className="absolute -top-0.5 h-4 w-0.5 bg-foreground"
                    style={{ left: `${(-l.average / spendPeak) * 100}%` }}
                  />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Last month {format(Math.abs(l.lastMonth))} · avg {format(Math.abs(l.average))}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Delta({ now, then, label }: { now: number; then: number; label: string }) {
  const diff = now - then
  if (diff === 0) return <p className="text-xs text-muted-foreground">same as {label}</p>
  return (
    <p
      className={cn(
        "text-xs",
        diff > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600",
      )}
    >
      {format(diff, { sign: "always" })} vs {label}
    </p>
  )
}

function CategoryPage({ line, month, back }: { line: Line; month: string; back: () => void }) {
  const peak = Math.max(...line.trend.map(Math.abs), Math.abs(line.average), 1)
  const rows = actualsIn(month, line.category)
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      <button
        type="button"
        onClick={back}
        className="flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeftIcon className="size-4" /> {monthLabel(month)}
      </button>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{line.name}</h1>
          <p className="text-sm text-muted-foreground">
            {monthLabel(month)}: <Amount cents={line.cents} /> · last month{" "}
            <Amount cents={line.lastMonth} /> · avg <Amount cents={line.average} />
          </p>
        </div>
        {line.category !== null && (
          <div className="flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="outline" onClick={stub("rename")}>
              Rename
            </Button>
            <Button size="sm" variant="outline" onClick={stub("merge into…")}>
              Merge into…
            </Button>
            <Button size="sm" variant="outline" onClick={stub("archive")}>
              {line.archived ? "Unarchive" : "Archive"}
            </Button>
          </div>
        )}
      </div>
      <div className="relative flex h-28 items-end gap-1 rounded-xl border p-2">
        {line.trend.map((cents, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-t",
              i === line.trend.length - 1 ? "bg-primary" : "bg-muted-foreground/30",
            )}
            style={{ height: `${(Math.abs(cents) / peak) * 100}%` }}
          />
        ))}
        <div
          className="pointer-events-none absolute inset-x-2 border-t border-dashed border-foreground"
          style={{ bottom: `calc(0.5rem + ${(Math.abs(line.average) / peak) * 6}rem)` }}
        />
      </div>
      <ul className="divide-y rounded-xl border text-sm">
        {rows.length === 0 && <li className="p-3 text-muted-foreground">No Actuals this month.</li>}
        {rows.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-3 py-2">
            <span className="w-24 shrink-0 text-muted-foreground">{shortDate(a.date)}</span>
            <span className="min-w-0 flex-1 truncate">{a.label}</span>
            <span className="text-xs text-muted-foreground">{a.wallet}</span>
            <Amount cents={a.cents} />
          </li>
        ))}
      </ul>
    </div>
  )
}

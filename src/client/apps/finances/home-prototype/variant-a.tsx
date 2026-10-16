// PROTOTYPE, throw away. Variant A: an inbox of things that need a person, then balances, then
// what's coming. Organised by task.
import { AlertTriangleIcon, PlusIcon, ScaleIcon, UploadIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  forecast,
  MISSING_CHECK,
  OVERDUE,
  shortDate,
  SUGGESTIONS,
  upcoming,
} from "@/apps/finances/home-prototype/data"
import { Amount, Balance, HorizonPicker, Pill, stub } from "@/apps/finances/home-prototype/shared"

export function VariantA() {
  const [horizon, setHorizon] = useState(90)
  const wallets = forecast(horizon)
  const needs = SUGGESTIONS.length + OVERDUE.length + MISSING_CHECK.length

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Finances</h1>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11" onClick={stub("upload")}>
            <UploadIcon /> Upload
          </Button>
          <Button className="h-11" onClick={stub("add actual")}>
            <PlusIcon /> Add
          </Button>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          Needs you <Pill tone={needs ? "warn" : "muted"}>{needs}</Pill>
        </h2>
        {SUGGESTIONS.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-xl border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Pill tone="info">{s.kind === "match" ? "To review" : "Same as this one?"}</Pill>
                <p className="mt-1 truncate font-mono text-sm">{s.actual.label}</p>
                <p className="text-xs text-muted-foreground">
                  {shortDate(s.actual.date)}
                  {s.planned && ` · planned ${s.planned.label}, ${shortDate(s.planned.date)}`}
                </p>
              </div>
              <Amount cents={s.actual.cents} className="shrink-0 font-medium" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-10 flex-1" onClick={stub("confirm")}>
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10 flex-1"
                onClick={stub("not this")}
              >
                Not this
              </Button>
            </div>
          </div>
        ))}
        {OVERDUE.map((p) => (
          <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-amber-300 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Pill tone="warn">Overdue</Pill>
                <p className="mt-1 font-medium">{p.label}</p>
                <p className="text-xs text-muted-foreground">
                  Was due {shortDate(p.date)} · counted today in the forecast
                </p>
              </div>
              <Amount cents={p.cents} className="shrink-0 font-medium" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-10 flex-1" onClick={stub("reconcile")}>
                Reconcile
              </Button>
              <Button size="sm" variant="outline" className="h-10 flex-1" onClick={stub("move")}>
                Move
              </Button>
              <Button size="sm" variant="outline" className="h-10 flex-1" onClick={stub("skip")}>
                Skip
              </Button>
            </div>
          </div>
        ))}
        {MISSING_CHECK.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <div>
              <Pill tone="muted">No balance yet</Pill>
              <p className="mt-1 font-medium">
                {w.name} has no forecast until its first Balance check
              </p>
            </div>
            <Button size="sm" variant="outline" className="h-10" onClick={stub("balance check")}>
              <ScaleIcon /> Enter
            </Button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Balances</h2>
          <HorizonPicker value={horizon} onChange={setHorizon} />
        </div>
        <div className="divide-y rounded-xl border">
          {wallets.map((f) => (
            <div key={f.wallet.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">{f.wallet.name}</p>
                <p className="text-xs text-muted-foreground">
                  Low <Balance cents={f.lowest.balance} /> on {shortDate(f.lowest.date)}
                </p>
                {f.firstBelowZero ? (
                  <Pill tone="bad">
                    <AlertTriangleIcon className="size-3" /> Below $0 on{" "}
                    {shortDate(f.firstBelowZero)}
                  </Pill>
                ) : (
                  f.firstBelowThreshold && (
                    <Pill tone="warn">Under threshold {shortDate(f.firstBelowThreshold)}</Pill>
                  )
                )}
              </div>
              <Balance cents={f.todayBalance} className="text-lg font-semibold" />
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Coming up</h2>
        <ul className="divide-y rounded-xl border">
          {upcoming(horizon, 8).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate">{p.label}</p>
                <p className="text-xs text-muted-foreground">
                  {shortDate(p.date)} ·{" "}
                  {p.transferTo ? "Transfer" : (p.category ?? "Uncategorised")}
                </p>
              </div>
              <Amount cents={p.cents} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

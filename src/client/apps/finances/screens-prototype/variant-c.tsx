// PROTOTYPE, throw away. Variant C: Schedules on a month calendar, tapping a day to act on its
// Occurrences. Wallets are one settings table for all of them, and each Wallet opens a reconcile
// workbench: unreconciled lines beside outstanding Planned, then a running-balance ledger.
import { ChevronLeftIcon } from "lucide-react"
import { useState } from "react"
import {
  activity,
  addDays,
  occurrences,
  SCHEDULES,
  scheduleName,
  shortDate,
  shown,
  TODAY,
  walletName,
  WALLETS,
  type ActivityRow,
  type Occurrence,
  type Schedule,
  type WalletId,
} from "@/apps/finances/screens-prototype/data"
import { Amount, Balance, Pill, stub } from "@/apps/finances/home-prototype/shared"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

export function VariantC() {
  const [tab, setTab] = useState<"calendar" | "wallets">("calendar")
  const [wallet, setWallet] = useState<WalletId | null>(null)
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      <div className="flex gap-4 border-b text-sm">
        {(["calendar", "wallets"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t)
              setWallet(null)
            }}
            className={cn(
              "h-11 border-b-2 capitalize",
              tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground",
            )}
          >
            {t === "calendar" ? "Schedules calendar" : "Wallets"}
          </button>
        ))}
      </div>
      {tab === "calendar" && <Calendar />}
      {tab === "wallets" && !wallet && <WalletTable open={setWallet} />}
      {tab === "wallets" && wallet && <Workbench id={wallet} back={() => setWallet(null)} />}
    </div>
  )
}

function Calendar() {
  const all = SCHEDULES.filter((s) => !s.ended).flatMap((s) =>
    occurrences(s.id).map((o) => ({ s, o })),
  )
  // Five weeks around today; a real calendar would start on a month's first week.
  const start = addDays(TODAY, -10)
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i))
  const [day, setDay] = useState(TODAY)
  const onDay = all.filter(({ o }) => o.date === day)
  const [openSchedule, setOpenSchedule] = useState<string | null>(null)

  return (
    <>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border bg-border text-xs">
        {days.map((d) => {
          const hits = all.filter(({ o }) => o.date === d)
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={cn(
                "flex aspect-square flex-col items-center gap-0.5 bg-background p-1",
                d === day && "bg-primary/10 ring-2 ring-primary ring-inset",
                d < TODAY && "text-muted-foreground",
              )}
            >
              <span className={cn(d === TODAY && "rounded-full bg-primary px-1 text-white")}>
                {d.slice(8)}
              </span>
              <span className="flex flex-wrap justify-center gap-0.5">
                {hits.map(({ s, o }) => (
                  <span
                    key={s.id}
                    className={cn(
                      "size-1.5 rounded-full",
                      o.cents > 0 ? "bg-emerald-600" : "bg-foreground/60",
                      o.state === "overdue" && "bg-amber-500",
                      o.state === "skipped" && "bg-transparent ring-1 ring-foreground/40",
                    )}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <section>
        <h2 className="mb-1 text-sm font-medium">{shortDate(day)}</h2>
        {onDay.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
        <ul className="flex flex-col gap-2">
          {onDay.map(({ s, o }) => (
            <DayItem key={s.id} s={s} o={o} />
          ))}
        </ul>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-medium">All Schedules</h2>
          <Button size="sm" variant="outline" onClick={stub("new schedule")}>
            New Schedule
          </Button>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {SCHEDULES.map((s) => (
              <ScheduleRow
                key={s.id}
                s={s}
                open={openSchedule === s.id}
                toggle={() => setOpenSchedule(openSchedule === s.id ? null : s.id)}
              />
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

function DayItem({ s, o }: { s: Schedule; o: Occurrence }) {
  return (
    <li className="rounded-xl border p-3 text-sm">
      <div className="flex justify-between gap-2">
        <span className="font-medium">
          {scheduleName(s)} {o.state !== "computed" && <Pill tone="info">{o.state}</Pill>}
        </span>
        <Amount cents={o.cents} />
      </div>
      <p className="text-muted-foreground">
        {walletName(s.wallet)}
        {s.transferTo && ` → ${walletName(s.transferTo)}`}
        {o.date !== o.nominal && ` · moved from ${shortDate(o.nominal)}`}
      </p>
      {o.state !== "reconciled" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={stub("override amount")}>
            {s.transferTo === "card" ? "Enter statement" : "Set amount"}
          </Button>
          <Button size="sm" variant="outline" onClick={stub("move")}>
            Move
          </Button>
          <Button size="sm" variant="ghost" onClick={stub("skip")}>
            {o.state === "skipped" ? "Unskip" : "Skip"}
          </Button>
        </div>
      )}
    </li>
  )
}

function ScheduleRow({ s, open, toggle }: { s: Schedule; open: boolean; toggle: () => void }) {
  const term = s.terms.at(-1)!
  return (
    <>
      <tr onClick={toggle} className={cn("cursor-pointer", s.ended && "text-muted-foreground")}>
        <td className="py-2 pr-2">
          {scheduleName(s)}
          <div className="text-xs text-muted-foreground">{term.every}</div>
        </td>
        <td className="py-2 pr-2 text-xs">{walletName(s.wallet)}</td>
        <td className="py-2 text-right">
          {s.ended ? <Pill tone="muted">ended</Pill> : <Amount cents={term.cents} />}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={3} className="bg-muted/60 p-3">
            <ol className="mb-2 flex flex-col gap-1 text-xs">
              {s.terms.toReversed().map((t) => (
                <li key={t.from}>
                  {shortDate(t.from)} – {t.to ? shortDate(t.to) : "now"}: {t.every},{" "}
                  <Amount cents={t.cents} />
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={stub("change from a date")}>
                Change from a date…
              </Button>
              <Button size="sm" variant="outline" onClick={stub("end")}>
                {s.ended ? "Reopen" : "End…"}
              </Button>
              <Button size="sm" variant="ghost" onClick={stub("edit labels")}>
                Account and Category
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function WalletTable({ open }: { open: (id: WalletId) => void }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 font-normal">Wallet</th>
              <th className="font-normal">Balance</th>
              <th className="font-normal">Forecast</th>
              <th className="font-normal">Threshold</th>
              <th className="font-normal">As owed</th>
              <th className="font-normal">Home</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {WALLETS.map((w) => (
              <tr key={w.id}>
                <td className="py-2">
                  <button
                    type="button"
                    className="font-medium underline"
                    onClick={() => open(w.id)}
                  >
                    {w.name}
                  </button>
                </td>
                <td>
                  <Balance cents={shown(w, w.balanceCents)} />
                </td>
                <td>
                  <input type="checkbox" defaultChecked={w.inForecast} className="size-5" />
                </td>
                <td>
                  <input
                    className="h-9 w-20 rounded-md border px-1 text-right"
                    defaultValue={(w.thresholdCents / 100).toFixed(0)}
                  />
                </td>
                <td>
                  <input type="checkbox" defaultChecked={w.shownAsOwed} className="size-5" />
                </td>
                <td>
                  <input
                    type="radio"
                    name="home"
                    defaultChecked={w.id === "checking"}
                    className="size-5"
                  />
                </td>
              </tr>
            ))}
            <tr>
              <td className="py-2">All</td>
              <td colSpan={4} />
              <td>
                <input type="radio" name="home" className="size-5" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Changes save as you make them.</p>
    </>
  )
}

function Workbench({ id, back }: { id: WalletId; back: () => void }) {
  const w = WALLETS.find((x) => x.id === id)!
  const rows = activity(id)
  const lines = rows.filter((r) => r.kind === "actual" && !r.reconciledTo)
  const planned = SCHEDULES.filter((s) => s.wallet === id || s.transferTo === id)
    .flatMap((s) => occurrences(s.id).map((o) => ({ s, o })))
    .filter(
      ({ o }) => o.state === "overdue" || (o.state !== "skipped" && o.date <= addDays(TODAY, 7)),
    )
    .filter(({ o }) => o.state !== "reconciled")
  const [line, setLine] = useState<string | null>(null)
  const [plan, setPlan] = useState<string | null>(null)

  const ledger = runningLedger(rows, id, w.balanceCents)

  return (
    <>
      <button
        type="button"
        onClick={back}
        className="-ml-2 flex h-10 items-center self-start px-2 text-sm text-muted-foreground"
      >
        <ChevronLeftIcon className="size-4" /> Wallets
      </button>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{w.name}</p>
          <Balance cents={shown(w, w.balanceCents)} className="text-3xl font-semibold" />
        </div>
        <Button size="sm" variant="outline" onClick={stub("enter balance check")}>
          Balance check
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <h2 className="mb-1 text-sm font-medium">Not reconciled ({lines.length})</h2>
          <ul className="flex flex-col gap-1">
            {lines.map(
              (r) =>
                r.kind === "actual" && (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setLine(r.id)}
                      className={cn(
                        "flex w-full justify-between rounded-lg border p-2 text-left text-sm",
                        line === r.id && "border-primary bg-primary/10",
                      )}
                    >
                      <span>
                        {r.label}
                        <span className="block text-xs text-muted-foreground">
                          {shortDate(r.date)}
                          {r.toReview && " · suggested"}
                        </span>
                      </span>
                      <Amount cents={shown(w, r.cents)} />
                    </button>
                  </li>
                ),
            )}
          </ul>
        </div>
        <div>
          <h2 className="mb-1 text-sm font-medium">Outstanding Planned ({planned.length})</h2>
          <ul className="flex flex-col gap-1">
            {planned.map(({ s, o }) => {
              const key = `${s.id}-${o.nominal}`
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setPlan(key)}
                    className={cn(
                      "flex w-full justify-between rounded-lg border border-dashed p-2 text-left text-sm",
                      plan === key && "border-primary bg-primary/10",
                    )}
                  >
                    <span>
                      {scheduleName(s)}
                      <span className="block text-xs text-muted-foreground">
                        {shortDate(o.date)}
                        {o.state === "overdue" && " · overdue"}
                      </span>
                    </span>
                    <Amount cents={shown(w, s.wallet === id ? o.cents : -o.cents)} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </section>
      <div className="flex gap-2">
        <Button disabled={!line || !plan} onClick={stub("reconcile pair")}>
          Reconcile selected
        </Button>
        <Button variant="outline" disabled={!line} onClick={stub("mark unplanned")}>
          Unplanned
        </Button>
        <Button variant="ghost" disabled={!line} onClick={stub("is transfer")}>
          Transfer
        </Button>
      </div>

      <section>
        <h2 className="mb-1 text-sm font-medium">Ledger</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {ledger.map(({ r, at }) => (
              <tr key={r.id} className={cn(r.kind === "check" && "bg-muted/60 font-medium")}>
                <td className="py-2 pr-2 text-xs text-muted-foreground">{shortDate(r.date)}</td>
                <td className="py-2 pr-2">
                  {r.kind === "check"
                    ? `Balance check${r.cents !== r.computedCents ? " (adjusts)" : ""}`
                    : r.kind === "transfer"
                      ? `Transfer ${r.wallet === id ? "to" : "from"} ${walletName(r.wallet === id ? r.other : r.wallet)}`
                      : r.label}
                </td>
                <td className="py-2 pr-2 text-right">
                  {r.kind !== "check" && (
                    <Amount cents={shown(w, r.wallet === id ? r.cents : -r.cents)} />
                  )}
                </td>
                <td className="py-2 text-right text-xs">
                  <Balance cents={shown(w, at)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

/** Running balance, newest first, resetting at each Balance check. */
function runningLedger(rows: ActivityRow[], id: WalletId, start: number) {
  const out: { r: ActivityRow; at: number }[] = []
  let running = start
  for (const r of rows) {
    if (r.kind === "check") running = r.cents
    out.push({ r, at: running })
    if (r.kind !== "check") running -= r.wallet === id ? r.cents : -r.cents
  }
  return out
}

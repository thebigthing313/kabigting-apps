// PROTOTYPE, throw away. Variant A: separate Schedules and Wallets sections. Each is a list that
// drills into a detail page; a Wallet's page splits into Activity, Balance checks and Settings tabs.
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import {
  activity,
  nextOccurrence,
  occurrences,
  SCHEDULES,
  scheduleName,
  shortDate,
  shown,
  walletName,
  WALLETS,
  type ActivityRow,
  type Occurrence,
  type Schedule,
  type WalletId,
  type WalletSettings,
} from "@/apps/finances/screens-prototype/data"
import { Amount, Balance, Pill, stub } from "@/apps/finances/home-prototype/shared"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

type View =
  | { at: "schedules" }
  | { at: "schedule"; id: string }
  | { at: "wallets" }
  | { at: "wallet"; id: WalletId; tab: "activity" | "checks" | "settings" }

export function VariantA() {
  const [view, setView] = useState<View>({ at: "schedules" })
  const section = view.at.startsWith("schedule") ? "schedules" : "wallets"

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      <div className="grid grid-cols-2 rounded-lg border p-0.5 text-sm">
        {(["schedules", "wallets"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setView({ at: s })}
            className={cn(
              "h-10 rounded-md capitalize",
              section === s ? "bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </div>
      {view.at === "schedules" && <ScheduleList open={(id) => setView({ at: "schedule", id })} />}
      {view.at === "schedule" && (
        <ScheduleDetail id={view.id} back={() => setView({ at: "schedules" })} />
      )}
      {view.at === "wallets" && (
        <WalletList open={(id) => setView({ at: "wallet", id, tab: "activity" })} />
      )}
      {view.at === "wallet" && (
        <WalletPage
          id={view.id}
          tab={view.tab}
          setTab={(tab) => setView({ ...view, tab })}
          back={() => setView({ at: "wallets" })}
        />
      )}
    </div>
  )
}

function ScheduleList({ open }: { open: (id: string) => void }) {
  const active = SCHEDULES.filter((s) => !s.ended)
  const ended = SCHEDULES.filter((s) => s.ended)
  const wallets = [...new Set(active.map((s) => s.wallet))]
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Schedules</h1>
        <Button size="sm" onClick={stub("new schedule")}>
          <PlusIcon /> New
        </Button>
      </div>
      {wallets.map((w) => (
        <section key={w}>
          <h2 className="mb-1 text-sm font-medium text-muted-foreground">{walletName(w)}</h2>
          <ul className="divide-y rounded-xl border">
            {active
              .filter((s) => s.wallet === w)
              .map((s) => (
                <ScheduleRow key={s.id} s={s} onClick={() => open(s.id)} />
              ))}
          </ul>
        </section>
      ))}
      <section>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Ended</h2>
        <ul className="divide-y rounded-xl border opacity-70">
          {ended.map((s) => (
            <ScheduleRow key={s.id} s={s} onClick={() => open(s.id)} />
          ))}
        </ul>
      </section>
    </>
  )
}

function ScheduleRow({ s, onClick }: { s: Schedule; onClick: () => void }) {
  const term = s.terms.at(-1)!
  const next = nextOccurrence(s.id)
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{scheduleName(s)}</p>
          <p className="truncate text-sm text-muted-foreground">
            {term.every}
            {s.ended ? ` · ended ${shortDate(s.ended)}` : next && ` · next ${shortDate(next.date)}`}
          </p>
        </div>
        <Amount cents={next?.cents ?? term.cents} className="text-sm" />
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </button>
    </li>
  )
}

function ScheduleDetail({ id, back }: { id: string; back: () => void }) {
  const s = SCHEDULES.find((x) => x.id === id)!
  const occ = occurrences(id)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <>
      <BackBar label="Schedules" back={back} />
      <div>
        <h1 className="text-xl font-semibold">{scheduleName(s)}</h1>
        <p className="text-sm text-muted-foreground">
          {walletName(s.wallet)}
          {s.transferTo && ` → ${walletName(s.transferTo)}`}
          {s.category && ` · ${s.category}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={stub("change from a date")}>
          Change from a date…
        </Button>
        <Button variant="outline" size="sm" onClick={stub("end")}>
          {s.ended ? "Reopen" : "End…"}
        </Button>
      </div>

      <section>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">Occurrences</h2>
        <ul className="divide-y rounded-xl border">
          {occ.map((o) => (
            <li key={o.nominal} className="px-3 py-2">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() => setEditing(editing === o.nominal ? null : o.nominal)}
              >
                <span className="flex-1">
                  <span className={cn(o.state === "skipped" && "line-through")}>
                    {shortDate(o.date)}
                  </span>{" "}
                  <StatePill o={o} />
                </span>
                <Amount cents={o.cents} className="text-sm" />
              </button>
              {editing === o.nominal && <OccurrenceEditor s={s} o={o} />}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium text-muted-foreground">History</h2>
        <ol className="flex flex-col gap-1 text-sm">
          {s.terms.toReversed().map((t) => (
            <li key={t.from} className="flex justify-between rounded-lg bg-muted px-3 py-2">
              <span>
                {shortDate(t.from)} – {t.to ? shortDate(t.to) : "now"}: {t.every}
              </span>
              <Amount cents={t.cents} />
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function OccurrenceEditor({ s, o }: { s: Schedule; o: Occurrence }) {
  if (o.state === "reconciled")
    return (
      <p className="pt-2 text-sm text-muted-foreground">Reconciled. Open the Actual to undo.</p>
    )
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg bg-muted p-3 text-sm">
      {s.transferTo === "card" && (
        <p className="text-muted-foreground">
          From the statement: set the amount to the statement balance and the date to the due date.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          {s.transferTo === "card" ? "Statement balance" : "Amount"}
          <input className="h-10 rounded-md border bg-background px-2" defaultValue="" />
        </label>
        <label className="flex flex-col gap-1">
          {s.transferTo === "card" ? "Due date" : "Date"}
          <input
            type="date"
            className="h-10 rounded-md border bg-background px-2"
            defaultValue={o.date}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={stub("save override")}>
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={stub("skip")}>
          {o.state === "skipped" ? "Unskip" : "Skip"}
        </Button>
        {o.state === "overridden" && (
          <Button size="sm" variant="ghost" onClick={stub("reset")}>
            Back to schedule
          </Button>
        )}
      </div>
    </div>
  )
}

function StatePill({ o }: { o: Occurrence }) {
  if (o.state === "computed") return null
  const tone = {
    overridden: "info",
    skipped: "muted",
    reconciled: "muted",
    overdue: "warn",
  } as const
  return <Pill tone={tone[o.state]}>{o.state}</Pill>
}

function WalletList({ open }: { open: (id: WalletId) => void }) {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Wallets</h1>
        <Button size="sm" onClick={stub("new wallet")}>
          <PlusIcon /> New
        </Button>
      </div>
      <ul className="divide-y rounded-xl border">
        {WALLETS.map((w) => (
          <li key={w.id}>
            <button
              type="button"
              onClick={() => open(w.id)}
              className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
            >
              <div className="flex-1">
                <p className="font-medium">{w.name}</p>
                <p className="text-sm text-muted-foreground">
                  {w.lastCheck ? `Checked ${shortDate(w.lastCheck)}` : "No Balance check"}
                  {!w.inForecast && " · not in the forecast"}
                </p>
              </div>
              <Balance cents={shown(w, w.balanceCents)} />
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

function WalletPage({
  id,
  tab,
  setTab,
  back,
}: {
  id: WalletId
  tab: "activity" | "checks" | "settings"
  setTab: (t: "activity" | "checks" | "settings") => void
  back: () => void
}) {
  const w = WALLETS.find((x) => x.id === id)!
  const rows = activity(id)
  return (
    <>
      <BackBar label="Wallets" back={back} />
      <div>
        <p className="text-sm text-muted-foreground">{w.name}</p>
        <Balance cents={shown(w, w.balanceCents)} className="text-3xl font-semibold" />
        {w.shownAsOwed && <span className="ml-2 text-sm text-muted-foreground">owed</span>}
      </div>
      <div className="flex border-b text-sm">
        {(
          [
            ["activity", "Activity"],
            ["checks", "Balance checks"],
            ["settings", "Settings"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "h-11 flex-1 border-b-2",
              tab === key
                ? "border-primary font-medium"
                : "border-transparent text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "activity" && <ActivityList w={w} rows={rows.filter((r) => r.kind !== "check")} />}
      {tab === "checks" && <ChecksList w={w} rows={rows} />}
      {tab === "settings" && <SettingsForm w={w} />}
    </>
  )
}

function ActivityList({ w, rows }: { w: WalletSettings; rows: ActivityRow[] }) {
  const review = rows.filter((r) => r.kind === "actual" && r.toReview)
  return (
    <>
      {review.length > 0 && (
        <section className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/40">
          <h2 className="mb-2 text-sm font-medium">To review ({review.length})</h2>
          <ul className="flex flex-col gap-2">
            {review.map(
              (r) =>
                r.kind === "actual" && (
                  <li key={r.id} className="rounded-lg bg-background p-2 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{r.label}</span>
                      <Amount cents={r.cents} />
                    </div>
                    <p className="text-muted-foreground">{r.toReview}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={stub("confirm")}>
                        Confirm
                      </Button>
                      <Button size="sm" variant="outline" onClick={stub("pick other")}>
                        Pick another
                      </Button>
                      <Button size="sm" variant="ghost" onClick={stub("unplanned")}>
                        Unplanned
                      </Button>
                    </div>
                  </li>
                ),
            )}
          </ul>
        </section>
      )}
      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="w-20 shrink-0 text-muted-foreground">{shortDate(r.date)}</span>
            <span className="min-w-0 flex-1 truncate">
              {r.kind === "actual" ? (
                <>
                  {r.label}
                  <span className="text-muted-foreground">
                    {r.category ? ` · ${r.category}` : " · Uncategorised"}
                    {r.reconciledTo && ` · ✓ ${r.reconciledTo}`}
                  </span>
                </>
              ) : (
                r.kind === "transfer" && (
                  <>
                    Transfer {r.wallet === w.id ? "to" : "from"}{" "}
                    {walletName(r.wallet === w.id ? r.other : r.wallet)}
                    {r.halves === 1 && <span className="text-amber-700"> · one side only</span>}
                  </>
                )
              )}
            </span>
            <Amount cents={r.wallet === w.id ? shown(w, r.cents) : shown(w, -r.cents)} />
          </li>
        ))}
      </ul>
    </>
  )
}

function ChecksList({ w, rows }: { w: WalletSettings; rows: ActivityRow[] }) {
  const checks = rows.filter((r) => r.kind === "check")
  return (
    <>
      <Button className="self-start" size="sm" onClick={stub("enter balance check")}>
        <PlusIcon /> Enter Balance check
      </Button>
      {checks.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
      <ul className="divide-y">
        {checks.map(
          (c) =>
            c.kind === "check" && (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="flex-1">{shortDate(c.date)}</span>
                {c.cents !== c.computedCents && (
                  <Pill tone="warn">
                    off by <Amount cents={c.cents - c.computedCents} />
                  </Pill>
                )}
                <Balance cents={shown(w, c.cents)} className="font-medium" />
              </li>
            ),
        )}
      </ul>
    </>
  )
}

function SettingsForm({ w }: { w: WalletSettings }) {
  return (
    <form className="flex flex-col gap-4 text-sm" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col gap-1">
        Name
        <input className="h-10 rounded-md border bg-background px-2" defaultValue={w.name} />
      </label>
      <Toggle label="In the forecast" on={w.inForecast} />
      <label className="flex flex-col gap-1">
        Low-balance threshold
        <input
          className="h-10 rounded-md border bg-background px-2"
          defaultValue={(w.thresholdCents / 100).toFixed(2)}
        />
      </label>
      <Toggle label="Shown as owed (flip the sign)" on={w.shownAsOwed} />
      <Toggle label="Open on home (household-wide)" on={w.id === "checking"} />
      <p className="text-muted-foreground">
        Bank account id remembered from uploads: ••••{w.id === "card" ? "4421" : "0937"}
      </p>
      <Button className="self-start" onClick={stub("save settings")}>
        Save
      </Button>
    </form>
  )
}

function Toggle({ label, on }: { label: string; on: boolean }) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-3">
      {label}
      <input type="checkbox" defaultChecked={on} className="size-5" />
    </label>
  )
}

function BackBar({ label, back }: { label: string; back: () => void }) {
  return (
    <button
      type="button"
      onClick={back}
      className="-ml-2 flex h-10 items-center self-start px-2 text-sm text-muted-foreground"
    >
      <ChevronLeftIcon className="size-4" /> {label}
    </button>
  )
}

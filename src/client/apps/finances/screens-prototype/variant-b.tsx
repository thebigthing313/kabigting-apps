// PROTOTYPE, throw away. Variant B: the Wallet is the hub. One timeline per Wallet runs from upcoming
// Occurrences down through a Today line into past Actuals, Transfers and Balance checks. Schedules
// and settings live on the Wallet page; every row opens a bottom sheet with its actions.
import { CheckIcon, RepeatIcon, SettingsIcon, XIcon } from "lucide-react"
import { useState } from "react"
import {
  activity,
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
  type WalletSettings,
} from "@/apps/finances/screens-prototype/data"
import { Amount, Balance, Pill, stub } from "@/apps/finances/home-prototype/shared"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

type Sheet =
  | { kind: "occurrence"; s: Schedule; o: Occurrence }
  | { kind: "row"; r: ActivityRow }
  | { kind: "schedule"; s: Schedule }
  | { kind: "settings" }

export function VariantB() {
  const [walletId, setWalletId] = useState<WalletId>("checking")
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [showSchedules, setShowSchedules] = useState(false)
  const w = WALLETS.find((x) => x.id === walletId)!
  const mine = SCHEDULES.filter(
    (s) => !s.ended && (s.wallet === walletId || s.transferTo === walletId),
  )
  const upcoming = mine
    .flatMap((s) => occurrences(s.id).map((o) => ({ s, o })))
    .filter(({ o }) => o.state !== "reconciled")
    .toSorted((a, b) => b.o.date.localeCompare(a.o.date))
  const past = activity(walletId)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 pb-24">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {WALLETS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setWalletId(x.id)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-4 text-sm",
              x.id === walletId && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {x.name}
          </button>
        ))}
      </div>

      <div className="flex items-start justify-between">
        <div>
          <Balance cents={shown(w, w.balanceCents)} className="text-3xl font-semibold" />
          <p className="text-sm text-muted-foreground">
            {w.shownAsOwed && "owed · "}
            {w.lastCheck ? `checked ${shortDate(w.lastCheck)}` : "no Balance check yet"}
            {!w.inForecast && " · not in the forecast"}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Wallet settings"
          onClick={() => setSheet({ kind: "settings" })}
        >
          <SettingsIcon />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setShowSchedules(!showSchedules)}
        className="flex h-11 items-center gap-2 rounded-xl border px-3 text-sm"
      >
        <RepeatIcon className="size-4" /> {mine.length} Schedules use this Wallet
        <span className="ml-auto text-muted-foreground">{showSchedules ? "Hide" : "Show"}</span>
      </button>
      {showSchedules && (
        <ul className="flex flex-wrap gap-2">
          {mine.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSheet({ kind: "schedule", s })}
                className="h-9 rounded-full bg-muted px-3 text-sm"
              >
                {scheduleName(s)} · <Amount cents={s.terms.at(-1)!.cents} />
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={stub("new schedule")}
              className="h-9 rounded-full border border-dashed px-3 text-sm"
            >
              + Schedule
            </button>
          </li>
        </ul>
      )}

      <ol className="flex flex-col">
        {upcoming.map(({ s, o }) => (
          <li key={`${s.id}-${o.nominal}`}>
            <button
              type="button"
              onClick={() => setSheet({ kind: "occurrence", s, o })}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 border-b border-dashed py-2 text-left text-sm",
                o.state === "skipped" && "opacity-50",
              )}
            >
              <span className="w-20 shrink-0 text-muted-foreground">{shortDate(o.date)}</span>
              <span className={cn("flex-1 truncate", o.state === "skipped" && "line-through")}>
                {scheduleName(s)}{" "}
                {o.state !== "computed" && (
                  <Pill tone={o.state === "overdue" ? "warn" : "info"}>{o.state}</Pill>
                )}
              </span>
              <Amount cents={sideCents(w, s, o.cents)} />
            </button>
          </li>
        ))}
        <li className="my-2 flex items-center gap-2 text-xs font-semibold tracking-wide text-primary uppercase">
          <span className="h-px flex-1 bg-primary" /> Today {shortDate(TODAY)}
          <span className="h-px flex-1 bg-primary" />
        </li>
        {past.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setSheet({ kind: "row", r })}
              className={cn(
                "flex min-h-12 w-full items-center gap-3 border-b py-2 text-left text-sm",
                r.kind === "check" && "bg-muted/60",
              )}
            >
              <span className="w-20 shrink-0 text-muted-foreground">{shortDate(r.date)}</span>
              <RowLabel w={w} r={r} />
              {r.kind === "check" ? (
                <Balance cents={shown(w, r.cents)} className="font-semibold" />
              ) : (
                <Amount cents={shown(w, r.wallet === w.id ? r.cents : -r.cents)} />
              )}
            </button>
          </li>
        ))}
      </ol>

      {sheet && <BottomSheet w={w} sheet={sheet} close={() => setSheet(null)} />}
    </div>
  )
}

/** A Planned Transfer is money out of its first Wallet and into the other. */
function sideCents(w: WalletSettings, s: Schedule, cents: number) {
  return shown(w, s.wallet === w.id ? cents : -cents)
}

function RowLabel({ w, r }: { w: WalletSettings; r: ActivityRow }) {
  if (r.kind === "check")
    return (
      <span className="flex-1 truncate font-medium">
        Balance check{" "}
        {r.cents !== r.computedCents ? (
          <Pill tone="warn">
            off by <Amount cents={r.cents - r.computedCents} />
          </Pill>
        ) : (
          <Pill tone="muted">matches</Pill>
        )}
      </span>
    )
  if (r.kind === "transfer")
    return (
      <span className="flex-1 truncate">
        Transfer {r.wallet === w.id ? "to" : "from"}{" "}
        {walletName(r.wallet === w.id ? r.other : r.wallet)}
        {r.halves === 1 && <span className="text-amber-700"> · one side</span>}
      </span>
    )
  return (
    <span className="flex-1 truncate">
      {r.label}
      {r.toReview && (
        <>
          {" "}
          <Pill tone="warn">review</Pill>
        </>
      )}
      {r.reconciledTo && <CheckIcon className="ml-1 inline size-3.5 text-emerald-600" />}
      <span className="text-muted-foreground"> · {r.category ?? "Uncategorised"}</span>
    </span>
  )
}

function BottomSheet({ w, sheet, close }: { w: WalletSettings; sheet: Sheet; close: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={close}>
      <div
        className="mx-auto flex max-h-[80dvh] w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-t-2xl bg-background p-4 pb-28"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{title(w, sheet)}</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={close}>
            <XIcon />
          </Button>
        </div>
        {sheet.kind === "occurrence" && <OccurrenceActions s={sheet.s} o={sheet.o} />}
        {sheet.kind === "schedule" && <ScheduleActions s={sheet.s} />}
        {sheet.kind === "row" && <RowActions r={sheet.r} />}
        {sheet.kind === "settings" && <Settings w={w} />}
      </div>
    </div>
  )
}

function title(w: WalletSettings, sheet: Sheet): string {
  if (sheet.kind === "settings") return `${w.name} settings`
  if (sheet.kind === "schedule") return scheduleName(sheet.s)
  if (sheet.kind === "occurrence") return `${scheduleName(sheet.s)}, ${shortDate(sheet.o.nominal)}`
  const r = sheet.r
  return r.kind === "actual" ? r.label : r.kind === "check" ? "Balance check" : "Transfer"
}

function OccurrenceActions({ s, o }: { s: Schedule; o: Occurrence }) {
  const card = s.transferTo === "card"
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {o.state === "overridden" ? "Overridden from the Schedule's" : "From the Schedule:"}{" "}
        <Amount cents={s.terms.at(-1)!.cents} /> on {shortDate(o.nominal)}
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          {card ? "Statement balance" : "Amount"}
          <input
            className="h-11 rounded-md border px-2"
            defaultValue={(Math.abs(o.cents) / 100).toFixed(2)}
          />
        </label>
        <label className="flex flex-col gap-1">
          {card ? "Due date" : "Date"}
          <input type="date" className="h-11 rounded-md border px-2" defaultValue={o.date} />
        </label>
      </div>
      <Button onClick={stub("save override")}>Save for this one</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={stub("skip")}>
          {o.state === "skipped" ? "Unskip" : "Skip this one"}
        </Button>
        <Button variant="outline" onClick={stub("change from here")}>
          Change from here on…
        </Button>
      </div>
      {o.state === "overdue" && (
        <Button variant="secondary" onClick={stub("reconcile by hand")}>
          Pick the Actual that paid it…
        </Button>
      )}
    </>
  )
}

function ScheduleActions({ s }: { s: Schedule }) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {walletName(s.wallet)}
        {s.transferTo && ` → ${walletName(s.transferTo)}`} · {s.category ?? "no Category"}
      </p>
      <ol className="flex flex-col gap-1 text-sm">
        {s.terms.toReversed().map((t) => (
          <li key={t.from} className="flex justify-between rounded-lg bg-muted px-3 py-2">
            <span>
              {t.to ? `${shortDate(t.from)} – ${shortDate(t.to)}` : `From ${shortDate(t.from)}`}:{" "}
              {t.every}
            </span>
            <Amount cents={t.cents} />
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={stub("change from a date")}>
          Change from a date…
        </Button>
        <Button variant="outline" onClick={stub("end")}>
          End…
        </Button>
      </div>
    </>
  )
}

function RowActions({ r }: { r: ActivityRow }) {
  if (r.kind === "check")
    return (
      <>
        <p className="text-sm">
          Entered <Balance cents={r.cents} />, computed <Balance cents={r.computedCents} />.
        </p>
        <Button variant="outline" onClick={stub("replace check")}>
          Replace this Balance check
        </Button>
      </>
    )
  if (r.kind === "transfer")
    return (
      <>
        <p className="text-sm">
          {r.halves === 2
            ? "Both banks' lines are matched to this Transfer."
            : `Only this Wallet's line so far. ${walletName(r.other)}'s line joins when it arrives.`}
        </p>
        <Button variant="outline" onClick={stub("unpair")}>
          Not a Transfer
        </Button>
      </>
    )
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {r.source === "upload"
          ? "From an upload: amount, date and Wallet are locked."
          : "Entered by hand."}
      </p>
      {r.toReview && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
          {r.toReview}
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={stub("confirm")}>
              Confirm
            </Button>
            <Button size="sm" variant="outline" onClick={stub("pick another")}>
              Pick another
            </Button>
          </div>
        </div>
      )}
      {r.reconciledTo && (
        <p className="text-sm">
          Reconciled to {r.reconciledTo}.{" "}
          <button type="button" className="underline" onClick={stub("unreconcile")}>
            Undo
          </button>
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="flex flex-col gap-1">
          Category
          <input className="h-11 rounded-md border px-2" defaultValue={r.category ?? ""} />
        </label>
        <label className="flex flex-col gap-1">
          Account
          <input className="h-11 rounded-md border px-2" defaultValue={r.reconciledTo ?? ""} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={stub("mark transfer")}>
          It's a Transfer…
        </Button>
        <Button variant="outline" onClick={stub("delete")}>
          Delete
        </Button>
      </div>
    </>
  )
}

function Settings({ w }: { w: WalletSettings }) {
  const row = "flex min-h-11 items-center justify-between gap-3 border-b text-sm"
  return (
    <>
      <label className={row}>
        In the forecast <input type="checkbox" defaultChecked={w.inForecast} className="size-5" />
      </label>
      <label className={row}>
        Low-balance threshold
        <input
          className="h-9 w-28 rounded-md border px-2 text-right"
          defaultValue={(w.thresholdCents / 100).toFixed(2)}
        />
      </label>
      <label className={row}>
        Shown as owed <input type="checkbox" defaultChecked={w.shownAsOwed} className="size-5" />
      </label>
      <label className={row}>
        Home opens on this Wallet
        <input type="radio" name="home" defaultChecked={w.id === "checking"} className="size-5" />
      </label>
      <Button onClick={stub("save settings")}>Save</Button>
    </>
  )
}

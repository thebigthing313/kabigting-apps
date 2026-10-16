// PROTOTYPE, throw away. Variant B: one Wallet's forecast as a chart and a day-by-day ledger.
// Organised by time; the things needing a person shrink to a banner.
import { AlertTriangleIcon, InboxIcon } from "lucide-react"
import { useState } from "react"
import {
  forecast,
  MISSING_CHECK,
  OVERDUE,
  shortDate,
  SUGGESTIONS,
  type WalletForecast,
} from "@/apps/finances/home-prototype/data"
import { Amount, Balance, HorizonPicker, stub } from "@/apps/finances/home-prototype/shared"
import { cn } from "cn"

export function VariantB() {
  const [horizon, setHorizon] = useState(90)
  const all = forecast(horizon)
  const [walletId, setWalletId] = useState(all[0]?.wallet.id)
  const f = all.find((x) => x.wallet.id === walletId) ?? all[0]
  if (!f) return null
  const needs = SUGGESTIONS.length + OVERDUE.length

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
        {all.map((x) => (
          <button
            key={x.wallet.id}
            type="button"
            onClick={() => setWalletId(x.wallet.id)}
            className={cn(
              "h-11 shrink-0 rounded-full border px-4 text-sm",
              x.wallet.id === f.wallet.id && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {x.wallet.name}
          </button>
        ))}
        {MISSING_CHECK.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={stub("balance check")}
            className="h-11 shrink-0 rounded-full border border-dashed px-4 text-sm text-muted-foreground"
          >
            {w.name}: enter balance
          </button>
        ))}
      </div>

      {needs > 0 && (
        <button
          type="button"
          onClick={stub("open review")}
          className="flex h-12 items-center gap-2 rounded-xl bg-amber-100 px-3 text-left text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          <InboxIcon className="size-4" />
          {SUGGESTIONS.length} to review · {OVERDUE.length} overdue
          <span className="ml-auto font-medium">Review</span>
        </button>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{f.wallet.name} today</p>
          <Balance cents={f.todayBalance} className="text-4xl font-semibold" />
          <p className="text-sm text-muted-foreground">
            Lowest <Balance cents={f.lowest.balance} /> on {shortDate(f.lowest.date)}
          </p>
        </div>
        <HorizonPicker value={horizon} onChange={setHorizon} />
      </div>

      <Chart f={f} />

      {(f.firstBelowZero ?? f.firstBelowThreshold) && (
        <p
          className={cn(
            "flex items-center gap-2 rounded-lg p-2 text-sm",
            f.firstBelowZero
              ? "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100"
              : "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
          )}
        >
          <AlertTriangleIcon className="size-4" />
          {f.firstBelowZero
            ? `Goes below $0 on ${shortDate(f.firstBelowZero)}`
            : `Drops under the threshold on ${shortDate(f.firstBelowThreshold!)}`}
        </p>
      )}

      <ol className="flex flex-col">
        {f.days
          .filter((d) => d.items.length > 0)
          .map((d) => (
            <li key={d.date} className="border-b py-2">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{shortDate(d.date)}</span>
                <Balance cents={d.balance} className="font-semibold" />
              </div>
              <ul>
                {d.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex justify-between gap-3 pl-3 text-sm text-muted-foreground"
                  >
                    <span className="truncate">
                      {item.label}
                      {item.overdue && <span className="text-amber-700"> · overdue</span>}
                      {item.actual && " · actual"}
                    </span>
                    <Amount cents={item.cents} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ol>
    </div>
  )
}

function Chart({ f }: { f: WalletForecast }) {
  const w = 600
  const h = 160
  const values = f.days.map((d) => d.balance)
  const min = Math.min(0, f.wallet.thresholdCents, ...values)
  const max = Math.max(...values, f.wallet.thresholdCents)
  const x = (i: number) => (i / Math.max(1, f.days.length - 1)) * w
  const y = (v: number) => h - ((v - min) / Math.max(1, max - min)) * h
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(v)}`).join(" ")
  const lowIndex = f.days.findIndex((d) => d.date === f.lowest.date)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full" preserveAspectRatio="none">
      <line
        x1={0}
        x2={w}
        y1={y(0)}
        y2={y(0)}
        className="stroke-destructive/50"
        strokeDasharray="4 4"
      />
      <line
        x1={0}
        x2={w}
        y1={y(f.wallet.thresholdCents)}
        y2={y(f.wallet.thresholdCents)}
        className="stroke-amber-500"
        strokeDasharray="2 4"
      />
      <path
        d={path}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={x(lowIndex)} cy={y(f.lowest.balance)} r={4} className="fill-amber-500" />
    </svg>
  )
}

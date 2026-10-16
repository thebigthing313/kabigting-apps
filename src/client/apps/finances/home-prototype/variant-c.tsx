// PROTOTYPE, throw away. Variant C: one card per Wallet, each carrying its own balance, low point,
// next items and pending work. Organised by Wallet, with one floating Add button.
import { PlusIcon, ScaleIcon, UploadIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  forecast,
  OVERDUE,
  shortDate,
  SUGGESTIONS,
  upcoming,
  WALLETS,
} from "@/apps/finances/home-prototype/data"
import { Amount, Balance, HorizonPicker, Pill, stub } from "@/apps/finances/home-prototype/shared"

export function VariantC() {
  const [horizon, setHorizon] = useState(90)
  const forecasts = forecast(horizon)
  const next = upcoming(horizon, 40)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-28">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Finances</h1>
        <HorizonPicker value={horizon} onChange={setHorizon} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {WALLETS.map((wallet) => {
          const f = forecasts.find((x) => x.wallet.id === wallet.id)
          const review = SUGGESTIONS.filter((s) => s.actual.wallet === wallet.id).length
          const overdue = OVERDUE.filter((p) => p.wallet === wallet.id).length
          const items = next.filter((p) => p.wallet === wallet.id || p.transferTo === wallet.id)

          if (!wallet.inForecast)
            return (
              <div
                key={wallet.id}
                className="rounded-xl border border-dashed p-4 text-muted-foreground"
              >
                <p className="font-medium">{wallet.name}</p>
                <p className="text-sm">Not in the forecast</p>
              </div>
            )

          if (!f)
            return (
              <div key={wallet.id} className="flex flex-col gap-3 rounded-xl border p-4">
                <p className="font-medium">{wallet.name}</p>
                <p className="text-sm text-muted-foreground">
                  No forecast until its first Balance check.
                </p>
                <Button variant="outline" className="h-11" onClick={stub("balance check")}>
                  <ScaleIcon /> Enter balance
                </Button>
              </div>
            )

          const span = Math.max(1, f.todayBalance - Math.min(0, f.lowest.balance))
          const lowShare = Math.max(
            0,
            Math.min(1, (f.lowest.balance - Math.min(0, f.lowest.balance)) / span),
          )
          return (
            <div key={wallet.id} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{wallet.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {review > 0 && <Pill tone="info">{review} to review</Pill>}
                    {overdue > 0 && <Pill tone="warn">{overdue} overdue</Pill>}
                    {f.firstBelowZero ? (
                      <Pill tone="bad">Below $0 {shortDate(f.firstBelowZero)}</Pill>
                    ) : (
                      f.firstBelowThreshold && (
                        <Pill tone="warn">Low {shortDate(f.firstBelowThreshold)}</Pill>
                      )
                    )}
                  </div>
                </div>
                <Balance cents={f.todayBalance} className="text-2xl font-semibold" />
              </div>

              <div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${lowShare * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lowest <Balance cents={f.lowest.balance} /> on {shortDate(f.lowest.date)}
                </p>
              </div>

              <ul className="flex flex-col gap-1 text-sm">
                {items.slice(0, 3).map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className="text-muted-foreground">{shortDate(p.date)}</span> {p.label}
                    </span>
                    <Amount cents={p.transferTo === wallet.id ? -p.cents : p.cents} />
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex gap-2">
                {(review > 0 || overdue > 0) && (
                  <Button className="h-10 flex-1" onClick={stub(`review ${wallet.id}`)}>
                    Review
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-10 flex-1"
                  onClick={stub(`upload ${wallet.id}`)}
                >
                  <UploadIcon /> Upload
                </Button>
                <Button
                  variant="outline"
                  className="h-10 flex-1"
                  onClick={stub(`check ${wallet.id}`)}
                >
                  <ScaleIcon /> Balance
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <Button
        className="fixed right-4 bottom-24 z-40 size-14 rounded-full shadow-lg md:right-8"
        onClick={stub("add actual")}
        aria-label="Add"
      >
        <PlusIcon className="size-6" />
      </Button>
    </div>
  )
}

// PROTOTYPE, throw away. Small bits the home screen variants share.
import { format } from "@shared/money"
import { cn } from "cn"

export const HORIZONS = [30, 90, 180, 365] as const

export function Amount({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        cents > 0 && "text-emerald-700 dark:text-emerald-400",
        className,
      )}
    >
      {format(cents, { sign: "always" })}
    </span>
  )
}

export function Balance({ cents, className }: { cents: number; className?: string }) {
  return (
    <span className={cn("tabular-nums", cents < 0 && "text-destructive", className)}>
      {format(cents)}
    </span>
  )
}

export function HorizonPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (days: number) => void
}) {
  return (
    <div className="inline-flex rounded-lg border p-0.5 text-sm">
      {HORIZONS.map((days) => (
        <button
          key={days}
          type="button"
          onClick={() => onChange(days)}
          className={cn(
            "h-9 min-w-11 rounded-md px-2",
            value === days ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          {days}d
        </button>
      ))}
    </div>
  )
}

export function Pill({
  tone,
  children,
}: {
  tone: "warn" | "bad" | "info" | "muted"
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "warn" && "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
        tone === "bad" && "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
        tone === "info" && "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  )
}

/** Stub for every button: the question is the layout, not the behaviour. */
export function stub(what: string) {
  // oxlint-disable-next-line no-console
  return () => console.info(`[prototype] ${what}`)
}

import { cn } from "cn"
import { AttentionBell } from "@/apps/finances/attention/attention-bell"
import type { ForecastHorizon } from "@shared/finances/forecast"

/**
 * A Finances page header: the page title, the page's own actions and the notifications bell. On
 * a narrow screen the actions and the bell wrap under a long title.
 */
export function FinancesHeader({
  title,
  titleClassName,
  beside,
  days,
  children,
}: {
  title: React.ReactNode
  titleClassName?: string | undefined
  /** Shown just after the title but outside it, such as a state mark. */
  beside?: React.ReactNode
  /** The horizon low-balance warnings are found in; home's own, else the default. */
  days?: ForecastHorizon | undefined
  /** The page's actions, such as a New button. */
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <h1 className={cn("min-w-0 text-2xl font-semibold break-words", titleClassName)}>
          {title}
        </h1>
        {beside}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {children}
        <AttentionBell days={days} />
      </div>
    </div>
  )
}

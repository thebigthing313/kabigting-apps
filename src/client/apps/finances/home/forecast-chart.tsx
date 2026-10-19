import { Line, LineChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatDisplayDate, formatMonthDay } from "@shared/dates"
import type { Forecast } from "@shared/finances/forecast"

const config = {
  balanceCents: { label: "End-of-day balance", color: "var(--primary)" },
} satisfies ChartConfig

/**
 * The Forecast's end-of-day balances as a step line, with the $0 and low-balance threshold lines
 * and the low point marked. Amounts keep their stored sign, so lower is always worse, on a Wallet
 * shown as owed too; `formatAmount` writes them as the Wallet shows them. There $0 means paid
 * off, so its line is muted rather than a warning.
 */
export function ForecastChart({
  forecast,
  thresholdCents,
  shownAsOwed,
  formatAmount,
  description,
}: {
  forecast: Forecast
  thresholdCents: number
  shownAsOwed: boolean
  formatAmount: (cents: number) => string
  /** What the chart shows, for screen readers. */
  description: string
}) {
  const { days, low } = forecast
  const balances = days.map((day) => day.balanceCents)
  // The $0 and threshold lines stay in view even when the balance never nears them.
  const domain = [
    Math.min(0, thresholdCents, ...balances),
    Math.max(0, thresholdCents, ...balances),
  ]

  return (
    <div role="img" aria-label={description}>
      <ChartContainer config={config} className="aspect-auto h-44 w-full">
        <LineChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={32}
            tickFormatter={formatMonthDay}
          />
          <YAxis hide domain={domain} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const date: unknown = payload[0]?.payload?.date
                  return typeof date === "string" ? formatDisplayDate(date) : ""
                }}
                formatter={(value) => (typeof value === "number" ? formatAmount(value) : value)}
              />
            }
          />
          <ReferenceLine
            y={0}
            stroke={shownAsOwed ? "var(--muted-foreground)" : "var(--destructive)"}
            strokeDasharray="6 4"
          />
          {thresholdCents === 0 ? null : (
            <ReferenceLine
              y={thresholdCents}
              stroke="var(--color-amber-500)"
              strokeDasharray="2 4"
            />
          )}
          <Line
            dataKey="balanceCents"
            type="stepAfter"
            stroke="var(--color-balanceCents)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <ReferenceDot
            x={low.date}
            y={low.balanceCents}
            r={5}
            fill="var(--color-amber-500)"
            stroke="var(--background)"
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}

import { Bar, BarChart, Cell, ReferenceLine, XAxis, YAxis } from "recharts"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatMonth, formatShortMonth } from "@shared/dates"
import type { CategoryYear } from "@shared/finances/summary"
import { format } from "@shared/money"

const config = {
  heightCents: { label: "Net", color: "var(--primary)" },
} satisfies ChartConfig

/**
 * A Category's year as monthly bars against a dashed line at its 12-month average, the shown
 * month in full colour. A Category that mostly spends is drawn upwards, so a taller bar is always
 * more of what the Category usually does; the tooltip gives the real, signed Amount.
 */
export function CategoryChart({
  year,
  month,
  description,
}: {
  year: CategoryYear
  month: string
  /** What the chart shows, for screen readers. */
  description: string
}) {
  const total = year.bars.reduce((sum, bar) => sum + bar.cents, 0)
  const direction = total < 0 ? -1 : 1
  const data = year.bars.map((bar) => ({ ...bar, heightCents: direction * bar.cents }))

  return (
    <div role="img" aria-label={description}>
      <ChartContainer config={config} className="aspect-auto h-44 w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            minTickGap={4}
            tickFormatter={formatShortMonth}
          />
          <YAxis hide domain={[(min: number) => Math.min(0, min), "auto"]} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideIndicator
                labelFormatter={(_, payload) => {
                  const bar: unknown = payload[0]?.payload?.month
                  return typeof bar === "string" ? formatMonth(bar) : ""
                }}
                formatter={(_, __, item) => {
                  const cents: unknown = item.payload?.cents
                  return typeof cents === "number" ? format(cents) : null
                }}
              />
            }
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Bar dataKey="heightCents" radius={4} isAnimationActive={false}>
            {data.map((bar) => (
              <Cell
                key={bar.month}
                fill="var(--color-heightCents)"
                fillOpacity={bar.month === month ? 1 : 0.35}
              />
            ))}
          </Bar>
          <ReferenceLine
            y={direction * year.averageCents}
            stroke="var(--foreground)"
            strokeDasharray="6 4"
          />
        </BarChart>
      </ChartContainer>
    </div>
  )
}

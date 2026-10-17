import type { Forecast } from "@shared/finances/forecast"

const WIDTH = 600
const HEIGHT = 160
/** Room above and below the line, so the low point's mark is never clipped. */
const PAD = 8

/**
 * The Forecast's end-of-day balances as a line, with the $0 and low-balance threshold lines and
 * the low point marked. A plain SVG: the line is all it needs, so no charting library is pulled
 * in. Amounts are stored signs, so lower is always worse, on a Wallet shown as owed too.
 */
export function ForecastChart({
  forecast,
  thresholdCents,
  description,
}: {
  forecast: Forecast
  thresholdCents: number
  /** What the chart shows, for screen readers. */
  description: string
}) {
  const { days, low } = forecast
  const balances = days.map((day) => day.balanceCents)
  const min = Math.min(0, thresholdCents, ...balances)
  const max = Math.max(0, thresholdCents, ...balances)
  const x = (index: number) => (index / Math.max(1, days.length - 1)) * WIDTH
  const y = (cents: number) =>
    PAD + (HEIGHT - 2 * PAD) * (1 - (cents - min) / Math.max(1, max - min))
  // A step line: the balance holds all day and changes at the day's end.
  const path = balances
    .map((cents, index) => (index === 0 ? `M${x(0)},${y(cents)}` : `H${x(index)}V${y(cents)}`))
    .join("")
  const lowIndex = days.findIndex((day) => day.date === low.date)

  return (
    <svg
      role="img"
      aria-label={description}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-40 w-full overflow-visible rounded-lg border bg-muted/30"
    >
      <line
        x1={0}
        x2={WIDTH}
        y1={y(0)}
        y2={y(0)}
        className="stroke-destructive/60"
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
      />
      {thresholdCents === 0 ? null : (
        <line
          x1={0}
          x2={WIDTH}
          y1={y(thresholdCents)}
          y2={y(thresholdCents)}
          className="stroke-amber-500"
          strokeDasharray="2 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={path}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {/* An ellipse under preserveAspectRatio="none" would stretch; a zero-length line with a
          round cap stays a dot. */}
      <line
        x1={x(lowIndex)}
        x2={x(lowIndex)}
        y1={y(low.balanceCents)}
        y2={y(low.balanceCents)}
        className="stroke-amber-500"
        strokeWidth={10}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

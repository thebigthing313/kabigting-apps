// PROTOTYPE, throwaway. Summaries C: a separate Summary page, reached from a button on Home. It
// shows its working: a Balance table (Paid − Owed + Sent − Received) with each Balance's history
// as lines, then spending as monthly stacked columns over a from–to range plus a Category table.
import { cn } from "cn"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import { useState } from "react"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { formatMonth, formatShortMonth, monthDates, monthOfDate } from "@shared/dates"
import { format } from "@shared/money"
import { Signed } from "@/apps/split/prototype/common"
import { MEMBERS, type Store } from "@/apps/split/prototype/store"
import {
  activeMonths,
  balanceHistory,
  balanceParts,
  byCategory,
  expensesIn,
  monthsBetween,
} from "@/apps/split/prototype/summary"

const LINE_COLOURS = ["var(--chart-5)", "var(--chart-3)", "var(--chart-2)", "var(--chart-1)"]

export function SummaryC({ store }: { store: Store }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-24">
      <h1 className="text-xl font-semibold">Summary</h1>
      <BalanceSection store={store} />
      <SpendingSection store={store} />
    </div>
  )
}

function BalanceSection({ store }: { store: Store }) {
  const parts = balanceParts(store.entries)
  const history = balanceHistory(store.entries)
  const config = Object.fromEntries(
    MEMBERS.map((m, i) => [
      m.id,
      { label: m.former ? `${m.name} (former)` : m.name, color: LINE_COLOURS[i]! },
    ]),
  ) satisfies ChartConfig
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Balances</h2>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-1 text-left font-normal">Member</th>
            <th className="text-right font-normal">Paid</th>
            <th className="text-right font-normal">− Owed</th>
            <th className="text-right font-normal">+ Sent</th>
            <th className="text-right font-normal">− Received</th>
            <th className="text-right font-normal">= Balance</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {MEMBERS.map((m) => {
            const p = parts[m.id]!
            return (
              <tr key={m.id} className={cn("border-b", m.former && "text-muted-foreground italic")}>
                <td className="py-1.5">
                  {m.id === store.viewerId ? "You" : m.name}
                  {m.former && " (former)"}
                </td>
                <td className="text-right">{format(p.paid)}</td>
                <td className="text-right">{format(p.owed)}</td>
                <td className="text-right">{format(p.sent)}</td>
                <td className="text-right">{format(p.received)}</td>
                <td className="text-right font-medium">
                  <Signed cents={p.balance} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="text-xs text-muted-foreground">Each Balance at the end of every month</div>
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <LineChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatShortMonth}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(c: number) => format(c).replace(/\.\d\d$/, "")}
          />
          <ReferenceLine y={0} stroke="var(--foreground)" strokeOpacity={0.4} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const m: unknown = payload[0]?.payload?.month
                  return typeof m === "string" ? formatMonth(m) : ""
                }}
                formatter={(value, name) =>
                  typeof value === "number"
                    ? `${config[String(name)]?.label ?? name} ${format(value, { sign: "always" })}`
                    : null
                }
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {MEMBERS.map((m) => (
            <Line
              key={m.id}
              dataKey={m.id}
              type="stepAfter"
              stroke={`var(--color-${m.id})`}
              strokeWidth={m.id === store.viewerId ? 3 : 1.5}
              strokeDasharray={m.former ? "4 3" : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </section>
  )
}

function SpendingSection({ store }: { store: Store }) {
  const months = activeMonths(store.entries)
  const [from, setFrom] = useState(months[Math.max(0, months.length - 6)]!)
  const [to, setTo] = useState(months.at(-1)!)
  const range = monthsBetween(from, to)
  const expenses = expensesIn(store.entries, monthDates(from).first, monthDates(to).last)
  const household = byCategory(expenses, null)
  const mine = byCategory(expenses, store.viewerId)
  const top = household.slice(0, 4)
  const series = [...top.map((t) => t.categoryId), ...(household.length > 4 ? ["rest"] : [])]
  const data = range.map((month) => {
    const row: Record<string, number | string> = { month }
    for (const t of byCategory(
      expenses.filter((e) => monthOfDate(e.date) === month),
      null,
    )) {
      const key = series.includes(t.categoryId) ? t.categoryId : "rest"
      row[key] = (Number(row[key]) || 0) + t.cents
    }
    return row
  })
  const config = Object.fromEntries(
    series.map((key, i) => [
      key,
      {
        label:
          key === "rest" ? "Everything else" : household.find((t) => t.categoryId === key)!.name,
        color: `var(--chart-${5 - i})`,
      },
    ]),
  ) satisfies ChartConfig
  const sum = household.reduce((s, t) => s + t.cents, 0)
  const mineSum = mine.reduce((s, t) => s + t.cents, 0)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Spending by Category</h2>
        <div className="flex items-center gap-1 text-sm">
          <MonthSelect label="From" value={from} months={months} onChange={setFrom} max={to} />
          <span>to</span>
          <MonthSelect label="To" value={to} months={months} onChange={setTo} min={from} />
        </div>
      </div>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatShortMonth}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(c: number) => format(c).replace(/\.\d\d$/, "")}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const m: unknown = payload[0]?.payload?.month
                  return typeof m === "string" ? formatMonth(m) : ""
                }}
                formatter={(value, name) =>
                  typeof value === "number"
                    ? `${config[String(name)]?.label ?? name} ${format(value)}`
                    : null
                }
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="spend"
              fill={`var(--color-${key})`}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="py-1 text-left font-normal">Category</th>
            <th className="text-right font-normal">Expenses</th>
            <th className="text-right font-normal">Household</th>
            <th className="text-right font-normal">Share</th>
            <th className="text-right font-normal">Your share</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {household.map((t) => (
            <tr key={t.categoryId} className="border-b">
              <td className="py-1.5">{t.name}</td>
              <td className="text-right">{t.count}</td>
              <td className="text-right">{format(t.cents)}</td>
              <td className="text-right text-muted-foreground">
                {sum > 0 ? `${Math.round((t.cents / sum) * 100)}%` : ""}
              </td>
              <td className="text-right">
                {format(mine.find((m) => m.categoryId === t.categoryId)?.cents ?? 0)}
              </td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="py-1.5">Total</td>
            <td className="text-right">{expenses.length}</td>
            <td className="text-right">{format(sum)}</td>
            <td />
            <td className="text-right">{format(mineSum)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground">
        Household is each Expense's total; your share is your Owed share. Refunds net against their
        Category, and Payments are never spending.
      </p>
    </section>
  )
}

function MonthSelect({
  label,
  value,
  months,
  onChange,
  min,
  max,
}: {
  label: string
  value: string
  months: string[]
  onChange: (month: string) => void
  min?: string
  max?: string
}) {
  return (
    <select
      aria-label={label}
      className="h-8 rounded-lg border bg-transparent px-2"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {months
        .filter((m) => (!min || m >= min) && (!max || m <= max))
        .map((m) => (
          <option key={m} value={m}>
            {formatMonth(m)}
          </option>
        ))}
    </select>
  )
}

// PROTOTYPE, throwaway. Summaries A: the Variant B Home gets three tabs under the Balance card.
// Balances is a row per Member with a bar either side of zero; Spending is ranked bars over a
// chosen period, and tapping a Category lists its Expenses.
import { cn } from "cn"
import { HandCoinsIcon } from "lucide-react"
import { useState } from "react"
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { type ChartConfig, ChartContainer } from "@/components/ui/chart"
import { formatDisplayDate } from "@shared/dates"
import { format } from "@shared/money"
import { Signed, balanceWords } from "@/apps/split/prototype/common"
import { MEMBERS, type Store, effect, memberName } from "@/apps/split/prototype/store"
import {
  byCategory,
  counted,
  expensesIn,
  periods,
  suggestedPayments,
} from "@/apps/split/prototype/summary"

type Tab = "activity" | "balances" | "spending"

export function SummaryA({ store }: { store: Store }) {
  const [tab, setTab] = useState<Tab>("balances")
  const mine = store.balances[store.viewerId] ?? 0
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 pb-24">
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <div className="text-sm opacity-80">Your Balance</div>
        <div className="text-3xl font-semibold tabular-nums">
          {format(mine, { sign: "always" })}
        </div>
        <div className="text-sm opacity-80">
          {mine === 0
            ? "You're settled up"
            : mine > 0
              ? "The others owe you"
              : "You owe the others"}
        </div>
      </div>
      <div role="tablist" className="grid grid-cols-3 rounded-xl bg-muted p-1 text-sm">
        {(["activity", "balances", "spending"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "rounded-lg py-1.5 capitalize",
              tab === key && "bg-background font-medium shadow-sm",
            )}
          >
            {key}
          </button>
        ))}
      </div>
      {tab === "activity" && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          The card feed and the Add Expense / Settle up buttons from the Expense form prototype live
          here.
        </p>
      )}
      {tab === "balances" && <Balances store={store} />}
      {tab === "spending" && <Spending store={store} />}
    </div>
  )
}

function Balances({ store }: { store: Store }) {
  const shown = MEMBERS.filter((m) => !m.former || (store.balances[m.id] ?? 0) !== 0)
  const widest = Math.max(1, ...shown.map((m) => Math.abs(store.balances[m.id] ?? 0)))
  const suggestions = suggestedPayments(store.balances)
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {shown.map((member) => {
          const cents = store.balances[member.id] ?? 0
          const width = `${(Math.abs(cents) / widest) * 50}%`
          return (
            <li key={member.id} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className={cn("font-medium", member.former && "text-muted-foreground")}>
                  {member.id === store.viewerId ? "You" : member.name}
                  {member.former && " (former)"}
                </span>
                <span className="text-muted-foreground">{balanceWords(cents)}</span>
              </div>
              <div className="relative h-3 rounded-full bg-muted">
                <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/40" />
                <div
                  className={cn(
                    "absolute inset-y-0 rounded-full",
                    cents >= 0 ? "left-1/2 bg-emerald-600" : "right-1/2 bg-red-600",
                  )}
                  style={{ width }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Left of the line owes the others; right of it is owed. Balances always add up to zero.
      </p>
      <div className="flex flex-col gap-2 rounded-xl border p-3">
        <div className="text-sm font-medium">One way to settle everyone up</div>
        <div className="text-xs text-muted-foreground">
          A suggestion from the Balances, not who owes whom. Tapping one opens Settle up, filled in.
        </div>
        {suggestions.length === 0 && <div className="text-sm">Everyone's settled up.</div>}
        {suggestions.map((s) => (
          <Button
            key={`${s.fromId}-${s.toId}`}
            variant="outline"
            className="justify-between"
            onClick={() => undefined}
          >
            <span>
              {memberName(s.fromId)} pays {memberName(s.toId)}
            </span>
            <span className="flex items-center gap-1 tabular-nums">
              {format(s.amount)} <HandCoinsIcon />
            </span>
          </Button>
        ))}
      </div>
    </div>
  )
}

const config = { cents: { label: "Spent", color: "var(--primary)" } } satisfies ChartConfig

function Spending({ store }: { store: Store }) {
  const all = periods()
  const [periodKey, setPeriodKey] = useState("3m")
  const [mineOnly, setMineOnly] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const period = all.find((p) => p.key === periodKey)!
  const expenses = expensesIn(store.entries, period.first, period.last)
  const viewer = mineOnly ? store.viewerId : null
  const totals = byCategory(expenses, viewer)
  const sum = totals.reduce((s, t) => s + t.cents, 0)
  const listed = expenses.filter((e) => e.categoryId === picked && counted(e, viewer) !== 0)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {all.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPeriodKey(p.key)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm",
              p.key === periodKey && "border-primary bg-primary text-primary-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{format(sum)}</div>
          <div className="text-xs text-muted-foreground">
            {mineOnly ? "Your share" : "Household spending"} · {period.label.toLowerCase()}
          </div>
        </div>
        <div className="flex rounded-lg border text-xs">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setMineOnly(value)}
              className={cn("px-2 py-1", mineOnly === value && "bg-muted font-medium")}
            >
              {value ? "My share" : "Household"}
            </button>
          ))}
        </div>
      </div>
      {totals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Expenses in this period.</p>
      ) : (
        <ChartContainer
          config={config}
          className="aspect-auto w-full"
          style={{ height: totals.length * 36 + 8 }}
        >
          <BarChart
            data={totals}
            layout="vertical"
            margin={{ top: 0, right: 72, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide domain={[0, "dataMax"]} />
            <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} />
            <Bar
              dataKey="cents"
              radius={4}
              isAnimationActive={false}
              className="cursor-pointer"
              onClick={(data) => {
                const id: unknown = data.payload?.categoryId
                if (typeof id === "string") setPicked(id === picked ? null : id)
              }}
            >
              {totals.map((t) => (
                <Cell
                  key={t.categoryId}
                  fill="var(--color-cents)"
                  fillOpacity={picked === null || picked === t.categoryId ? 1 : 0.35}
                />
              ))}
              <LabelList
                dataKey="cents"
                position="right"
                className="fill-foreground text-xs"
                formatter={(value: unknown) => (typeof value === "number" ? format(value) : "")}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
      <p className="text-xs text-muted-foreground">
        Tap a bar to see its Expenses. Refunds net against their Category; Payments aren't spending.
      </p>
      {picked && (
        <ul className="flex flex-col divide-y rounded-xl border">
          {listed.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 p-2 text-sm">
              <span>
                {e.description}
                <span className="block text-xs text-muted-foreground">
                  {formatDisplayDate(e.date)} · your Balance{" "}
                  <Signed cents={effect(e)[store.viewerId] ?? 0} />
                </span>
              </span>
              <span className="tabular-nums">{format(counted(e, viewer))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

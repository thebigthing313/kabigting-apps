// PROTOTYPE, throw away. Variant A: a statement table. Arrows step the month; every figure sits in
// columns beside last month and the 12-month average; a row expands in place to its Actuals; a
// "Manage Categories" panel at the foot handles rename, archive and merge.
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { Fragment, useState } from "react"
import {
  actualsIn,
  addMonths,
  CATEGORIES,
  FIRST_MONTH,
  monthLabel,
  summary,
  THIS_MONTH,
  type CategoryId,
  type Figures,
} from "@/apps/finances/summary-prototype/data"
import { Amount, Pill, stub } from "@/apps/finances/home-prototype/shared"
import { shortDate } from "@/apps/finances/home-prototype/data"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

export function VariantA() {
  const [month, setMonth] = useState(addMonths(THIS_MONTH, -1))
  const [open, setOpen] = useState<CategoryId | null | undefined>(undefined)
  const [managing, setManaging] = useState(false)
  const s = summary(month)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          disabled={month <= FIRST_MONTH}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeftIcon />
        </Button>
        <div className="text-center">
          <h1 className="text-xl font-semibold">{monthLabel(month)}</h1>
          {month === THIS_MONTH && (
            <p className="text-xs text-muted-foreground">So far this month</p>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          disabled={month >= THIS_MONTH}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium" />
              <th className="px-3 py-2 text-right font-medium">{monthLabel(month, "short")}</th>
              <th className="px-3 py-2 text-right font-medium">Last month</th>
              <th className="px-3 py-2 text-right font-medium">12-mo avg</th>
            </tr>
          </thead>
          <tbody>
            {(["income", "spending", "net"] as const).map((k) => (
              <TotalRow key={k} k={k} now={s.totals} last={s.lastMonth} avg={s.average} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">{monthLabel(month, "short")}</th>
              <th className="px-3 py-2 text-right font-medium">Last month</th>
              <th className="px-3 py-2 text-right font-medium">12-mo avg</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {s.lines.map((line) => {
              const isOpen = open === line.category
              return (
                <Fragment key={line.category ?? "none"}>
                  <tr
                    className={cn("cursor-pointer hover:bg-muted/50", isOpen && "bg-muted/50")}
                    onClick={() => setOpen(isOpen ? undefined : line.category)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <ChevronDownIcon
                          className={cn(
                            "size-4 text-muted-foreground transition",
                            !isOpen && "-rotate-90",
                          )}
                        />
                        <span className={cn(line.category === null && "italic")}>{line.name}</span>
                        {line.archived && <Pill tone="muted">archived</Pill>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">
                      <Amount cents={line.cents} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">
                      <Amount cents={line.lastMonth} />
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">
                      <Amount cents={line.average} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={4} className="bg-muted/30 px-3 py-2">
                        <Actuals month={month} category={line.category} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <Button variant="outline" onClick={() => setManaging(!managing)}>
          {managing ? "Done" : "Manage Categories"}
        </Button>
      </div>
      {managing && <ManageCategories />}
    </div>
  )
}

function TotalRow({
  k,
  now,
  last,
  avg,
}: {
  k: keyof Figures
  now: Figures
  last: Figures
  avg: Figures
}) {
  return (
    <tr className={cn(k === "net" && "border-t font-semibold")}>
      <td className="px-3 py-2 capitalize">{k}</td>
      <td className="px-3 py-2 text-right">
        <Amount cents={now[k]} />
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground">
        <Amount cents={last[k]} />
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground">
        <Amount cents={avg[k]} />
      </td>
    </tr>
  )
}

function Actuals({ month, category }: { month: string; category: CategoryId | null }) {
  const rows = actualsIn(month, category)
  if (rows.length === 0) return <p className="py-2 text-muted-foreground">No Actuals this month.</p>
  return (
    <ul className="divide-y">
      {rows.map((a) => (
        <li key={a.id} className="flex items-center gap-3 py-1.5">
          <span className="w-24 shrink-0 text-muted-foreground">{shortDate(a.date)}</span>
          <span className="min-w-0 flex-1 truncate">{a.label}</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">{a.wallet}</span>
          <Amount cents={a.cents} />
        </li>
      ))}
    </ul>
  )
}

function ManageCategories() {
  return (
    <section className="rounded-xl border">
      <h2 className="border-b px-3 py-2 font-medium">Categories</h2>
      <ul className="divide-y">
        {CATEGORIES.map((c) => (
          <li
            key={c.id}
            className={cn("flex items-center gap-2 px-3 py-2 text-sm", c.archived && "opacity-60")}
          >
            <span className="flex-1">{c.name}</span>
            {c.archived ? (
              <Button size="sm" variant="ghost" onClick={stub(`unarchive ${c.name}`)}>
                Unarchive
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={stub(`rename ${c.name}`)}>
                  Rename
                </Button>
                <Button size="sm" variant="ghost" onClick={stub(`merge ${c.name} into…`)}>
                  Merge into…
                </Button>
                <Button size="sm" variant="ghost" onClick={stub(`archive ${c.name}`)}>
                  Archive
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="border-t p-2">
        <Button size="sm" onClick={stub("add category")}>
          Add Category
        </Button>
      </div>
    </section>
  )
}

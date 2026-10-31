// PROTOTYPE, throwaway: three Balance and Category summary variants inside the real Shell, for the
// "What do the balance and category summaries look like?" ticket, built around the Variant B Home
// that won the Expense form prototype. `?variant=A|B|C`, `?as=<member>`. Made-up data, in memory.
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { CURRENT, useSplitStore } from "@/apps/split/prototype/store"
import { SummaryA } from "@/apps/split/prototype/summary-a"
import { SummaryB } from "@/apps/split/prototype/summary-b"
import { SummaryC } from "@/apps/split/prototype/summary-c"
import { PrototypeSwitcher } from "@/components/prototype-switcher"

const VARIANTS = [
  { key: "A", name: "Tabs on Home" },
  { key: "B", name: "Woven into the feed, by month" },
  { key: "C", name: "Summary page, working shown" },
] as const

export const Route = createFileRoute("/_app/split-summaries-prototype")({
  validateSearch: z.object({
    variant: z.enum(["A", "B", "C"]).optional().catch(undefined),
    as: z.string().optional().catch(undefined),
  }),
  component: SplitSummariesPrototype,
})

function SplitSummariesPrototype() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const variant = search.variant ?? "A"
  const viewerId = CURRENT.some((member) => member.id === search.as) ? search.as! : "sam"
  const store = useSplitStore(viewerId)
  return (
    <>
      {variant === "A" && <SummaryA key={viewerId} store={store} />}
      {variant === "B" && <SummaryB key={viewerId} store={store} />}
      {variant === "C" && <SummaryC key={viewerId} store={store} />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) =>
          void navigate({
            search: (prev) => ({ ...prev, variant: VARIANTS.find((v) => v.key === key)?.key }),
            replace: true,
          })
        }
      >
        <select
          aria-label="View as"
          className="ml-1 rounded-full bg-white/15 px-2 py-1 text-white"
          value={viewerId}
          onChange={(event) =>
            void navigate({
              search: (prev) => ({ ...prev, as: event.target.value }),
              replace: true,
            })
          }
        >
          {CURRENT.map((member) => (
            <option key={member.id} value={member.id} className="text-black">
              as {member.name}
            </option>
          ))}
        </select>
      </PrototypeSwitcher>
    </>
  )
}

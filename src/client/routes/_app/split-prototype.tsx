// PROTOTYPE, throwaway: three Split Expense list + Expense form + Payment form variants inside the
// real Shell, for the "What does the Expense form look like?" ticket. `?variant=A|B|C`,
// `?as=<member>`. Made-up Members, in-memory data only.
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"
import { CURRENT, useSplitStore } from "@/apps/split/prototype/store"
import { VariantA } from "@/apps/split/prototype/variant-a"
import { VariantB } from "@/apps/split/prototype/variant-b"
import { VariantC } from "@/apps/split/prototype/variant-c"
import { PrototypeSwitcher } from "@/components/prototype-switcher"

const VARIANTS = [
  { key: "A", name: "List + dialog, sides side by side" },
  { key: "B", name: "Feed + guided steps" },
  { key: "C", name: "Ledger + grid sheet" },
] as const

export const Route = createFileRoute("/_app/split-prototype")({
  validateSearch: z.object({
    variant: z.enum(["A", "B", "C"]).optional().catch(undefined),
    as: z.string().optional().catch(undefined),
  }),
  component: SplitPrototype,
})

function SplitPrototype() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const variant = search.variant ?? "A"
  const viewerId = CURRENT.some((member) => member.id === search.as) ? search.as! : "sam"
  return (
    <Variants variant={variant} viewerId={viewerId}>
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
    </Variants>
  )
}

function Variants({
  variant,
  viewerId,
  children,
}: {
  variant: "A" | "B" | "C"
  viewerId: string
  children: React.ReactNode
}) {
  // Expenses survive switching variant or viewer; each variant's own UI state starts afresh.
  const store = useSplitStore(viewerId)
  return (
    <>
      {variant === "A" && <VariantA key={viewerId} store={store} />}
      {variant === "B" && <VariantB key={viewerId} store={store} />}
      {variant === "C" && <VariantC key={viewerId} store={store} />}
      {children}
    </>
  )
}

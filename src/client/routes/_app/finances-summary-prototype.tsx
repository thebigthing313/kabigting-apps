// PROTOTYPE, throw away. Three variants of the Monthly summary screen on stub data, switchable via
// ?variant=A|B|C. Lives only on the prototype/finances-screens branch.
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { VariantA } from "@/apps/finances/summary-prototype/variant-a"
import { VariantB } from "@/apps/finances/summary-prototype/variant-b"
import { VariantC } from "@/apps/finances/summary-prototype/variant-c"
import { PrototypeSwitcher } from "@/components/prototype-switcher"

const VARIANTS = [
  { key: "A", name: "Statement table" },
  { key: "B", name: "Bars against average" },
  { key: "C", name: "Income statement" },
] as const

export const Route = createFileRoute("/_app/finances-summary-prototype")({
  validateSearch: (search: Record<string, unknown>): { variant: string } => ({
    variant: typeof search.variant === "string" ? search.variant : "A",
  }),
  component: FinancesSummaryPrototype,
})

function FinancesSummaryPrototype() {
  const { variant } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={(key) => void navigate({ search: { variant: key }, replace: true })}
      />
    </>
  )
}

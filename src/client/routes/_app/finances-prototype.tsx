// PROTOTYPE, throw away. Three variants of the Finances home screen on stub data, switchable via
// ?variant=A|B|C. Lives only on the prototype/finances-home branch.
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { VariantA } from "@/apps/finances/home-prototype/variant-a"
import { VariantB } from "@/apps/finances/home-prototype/variant-b"
import { VariantC } from "@/apps/finances/home-prototype/variant-c"
import { PrototypeSwitcher } from "@/components/prototype-switcher"

const VARIANTS = [
  { key: "A", name: "Inbox first" },
  { key: "B", name: "Forecast first" },
  { key: "C", name: "Wallet cards" },
] as const

export const Route = createFileRoute("/_app/finances-prototype")({
  validateSearch: (search: Record<string, unknown>): { variant: string } => ({
    variant: typeof search.variant === "string" ? search.variant : "A",
  }),
  component: FinancesHomePrototype,
})

function FinancesHomePrototype() {
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

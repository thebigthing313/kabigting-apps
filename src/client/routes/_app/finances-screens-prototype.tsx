// PROTOTYPE, throw away. Three variants of the Schedule and Wallet screens on stub data, switchable
// via ?variant=A|B|C. Lives only on the prototype/finances-screens branch.
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { VariantA } from "@/apps/finances/screens-prototype/variant-a"
import { VariantB } from "@/apps/finances/screens-prototype/variant-b"
import { VariantC } from "@/apps/finances/screens-prototype/variant-c"
import { PrototypeSwitcher } from "@/components/prototype-switcher"

const VARIANTS = [
  { key: "A", name: "Lists and tabs" },
  { key: "B", name: "Wallet timeline" },
  { key: "C", name: "Calendar and workbench" },
] as const

export const Route = createFileRoute("/_app/finances-screens-prototype")({
  validateSearch: (search: Record<string, unknown>): { variant: string } => ({
    variant: typeof search.variant === "string" ? search.variant : "A",
  }),
  component: FinancesScreensPrototype,
})

function FinancesScreensPrototype() {
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

import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { FinancesHome } from "@/apps/finances/finances-home"
import { DEFAULT_HORIZON, FORECAST_HORIZONS } from "@shared/finances/forecast"

export const Route = createFileRoute("/_app/finances/")({
  // An unknown Wallet or horizon falls back to the default rather than failing the page.
  validateSearch: z.object({
    wallet: z.string().optional().catch(undefined),
    days: z.coerce
      .number()
      .pipe(z.literal([...FORECAST_HORIZONS]))
      .optional()
      .catch(undefined),
  }),
  component: FinancesHomeRoute,
})

function FinancesHomeRoute() {
  const { wallet, days } = Route.useSearch()
  return <FinancesHome walletId={wallet} days={days ?? DEFAULT_HORIZON} />
}

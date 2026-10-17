import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { WALLET_TABS, WalletPage } from "@/apps/finances/wallets/wallet-page"

export const Route = createFileRoute("/_app/finances/wallets/$walletId")({
  // An unknown tab falls back to Activity rather than failing the page.
  validateSearch: z.object({ tab: z.enum(WALLET_TABS).optional().catch(undefined) }),
  component: WalletRoute,
})

function WalletRoute() {
  const { walletId } = Route.useParams()
  const { tab } = Route.useSearch()
  return <WalletPage walletId={walletId} tab={tab ?? "activity"} />
}

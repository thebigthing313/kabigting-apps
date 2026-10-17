import { createFileRoute } from "@tanstack/react-router"
import { WalletsPage } from "@/apps/finances/wallets/wallets-page"

export const Route = createFileRoute("/_app/finances/wallets/")({
  component: WalletsPage,
})

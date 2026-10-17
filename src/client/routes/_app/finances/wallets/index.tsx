import { createFileRoute } from "@tanstack/react-router"
import { WalletsPage } from "@/apps/finances/finances-home"

export const Route = createFileRoute("/_app/finances/wallets/")({
  component: WalletsPage,
})

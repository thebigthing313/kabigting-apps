import { Link } from "@tanstack/react-router"
import { ChevronRightIcon, PlusIcon } from "lucide-react"
import { useState } from "react"
import { WalletForm } from "@/apps/finances/wallets/wallet-form"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { addWallet, useWallets, type Wallet } from "@/data/finances-wallets"

/** Every household Wallet; archived ones only when asked for. */
export function WalletsPage() {
  const { data: wallets, isLoading } = useWallets()
  const [creating, setCreating] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const archivedCount = wallets.filter((wallet) => wallet.archived).length
  const shown = showArchived ? wallets : wallets.filter((wallet) => !wallet.archived)

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Wallets</h1>
        <Button className="h-11" onClick={() => setCreating(true)}>
          <PlusIcon />
          New Wallet
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-muted-foreground">
          {wallets.length === 0
            ? "No Wallets yet. Add checking, a card or cash to start."
            : "Every Wallet is archived."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border" aria-label="Wallets">
          {shown.map((wallet) => (
            <WalletRow key={wallet.id} wallet={wallet} />
          ))}
        </ul>
      )}

      {archivedCount > 0 ? (
        <Field orientation="horizontal" className="self-start">
          <Checkbox
            id="show-archived"
            checked={showArchived}
            onCheckedChange={(checked) => setShowArchived(checked)}
          />
          <FieldLabel htmlFor="show-archived" className="font-normal">
            Show archived ({archivedCount})
          </FieldLabel>
        </Field>
      ) : null}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Wallet</DialogTitle>
            <DialogDescription>
              A place money is held, such as checking, a card or cash.
            </DialogDescription>
          </DialogHeader>
          <WalletForm
            submitLabel="Add Wallet"
            onSave={async (settings) => {
              // Stays open if the server refuses it (a taken name), keeping what was typed.
              if (await addWallet(settings)) setCreating(false)
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function WalletRow({ wallet }: { wallet: Wallet }) {
  // Balance checks arrive with their own slice; until then no Wallet has a balance to show.
  const details = [
    "No Balance check",
    ...(wallet.inForecast ? [] : ["not in the forecast"]),
    ...(wallet.archived ? ["archived"] : []),
  ]
  return (
    <li>
      <Link
        to="/finances/wallets/$walletId"
        params={{ walletId: wallet.id }}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{wallet.name}</p>
          <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  )
}

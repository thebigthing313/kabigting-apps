import { useState } from "react"
import {
  type BalanceCheckEntry,
  BalanceCheckForm,
} from "@/apps/finances/wallets/balance-check-form"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  enterBalanceCheck,
  NO_ACTUALS_YET,
  usePreviousBalanceCheck,
} from "@/data/finances-balance-checks"
import { useWallets, type Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import { compareToComputed } from "@shared/finances/balance-checks"
import { formatOffBy, formatShown } from "@shared/finances/wallets"

/** Enter Balance check: the form, then how the bank's figure compares with the computed one. */
export function BalanceCheckDialog({
  open,
  onOpenChange,
  walletId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The Wallet to start on. */
  walletId?: string
}) {
  const { data: wallets } = useWallets()
  const [saved, setSaved] = useState<BalanceCheckEntry | null>(null)
  const savedWallet = saved ? wallets.find((wallet) => wallet.id === saved.walletId) : undefined
  const choices = wallets.filter((wallet) => !wallet.archived || wallet.id === walletId)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSaved(null)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{saved ? "Balance check saved" : "Enter Balance check"}</DialogTitle>
          <DialogDescription>
            {saved
              ? "Nothing is adjusted automatically."
              : "The balance exactly as the bank shows it. A second check on the same date replaces the first."}
          </DialogDescription>
        </DialogHeader>
        {saved && savedWallet ? (
          <BalanceCheckResult
            entry={saved}
            wallet={savedWallet}
            onDone={() => {
              setSaved(null)
              onOpenChange(false)
            }}
          />
        ) : (
          <BalanceCheckForm
            wallets={choices}
            walletId={walletId}
            onSave={async (entry) => {
              // Stays open if the server refuses it, keeping what was typed.
              if (await enterBalanceCheck(entry)) setSaved(entry)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function BalanceCheckResult({
  entry,
  wallet,
  onDone,
}: {
  entry: BalanceCheckEntry
  wallet: Wallet
  onDone: () => void
}) {
  const { check: previous, isLoading } = usePreviousBalanceCheck(entry.walletId, entry.date)
  const comparison = compareToComputed(entry, previous, NO_ACTUALS_YET)

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Bank shows</dt>
        <dd className="text-right font-medium">{formatShown(wallet, entry.amountCents)}</dd>
        {isLoading ? null : comparison ? (
          <>
            <dt className="text-muted-foreground">Computed balance</dt>
            <dd className="text-right font-medium">
              {formatShown(wallet, comparison.computedCents)}
            </dd>
            <dt className="text-muted-foreground">Difference</dt>
            <dd className="text-right font-medium">
              {comparison.offByCents === 0
                ? "None, it matches"
                : formatOffBy(wallet, comparison.offByCents)}
            </dd>
          </>
        ) : null}
      </dl>
      {isLoading ? (
        <Skeleton className="h-10" />
      ) : comparison && previous ? (
        <p className="text-sm text-muted-foreground">
          Computed from the Balance check on {formatDisplayDate(previous.date)} plus the Actuals
          since.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          This is the first Balance check before {formatDisplayDate(entry.date)}, so there is
          nothing to compare it with.
        </p>
      )}
      <Button className="h-11 self-start" onClick={onDone}>
        Done
      </Button>
    </div>
  )
}

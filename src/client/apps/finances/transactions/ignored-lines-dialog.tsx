import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { restoreTransaction, useIgnoredLines } from "@/data/finances-transactions"
import type { Wallet } from "@/data/finances-wallets"
import { formatDisplayDate } from "@shared/dates"
import { toShown } from "@shared/finances/wallets"
import { format } from "@shared/money"

/** A Wallet's ignored lines: imported Actuals someone deleted, each of which can be restored. */
export function IgnoredLinesDialog({
  wallet,
  open,
  onOpenChange,
}: {
  wallet: Wallet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Nothing loads until the list is opened.
  const { lines, isLoading } = useIgnoredLines(wallet.id, open)
  const [restoring, setRestoring] = useState<string | null>(null)

  async function restore(id: string) {
    setRestoring(id)
    if (await restoreTransaction(id)) toast.success("Restored to Actuals")
    setRestoring(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Ignored lines</DialogTitle>
          <DialogDescription>
            Uploaded lines that were deleted. A later upload won&apos;t add them again.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-4 overflow-y-auto px-4 pb-1">
          {isLoading && lines.length === 0 ? (
            <Skeleton className="h-14" />
          ) : lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ignored lines.</p>
          ) : (
            <ul className="divide-y rounded-xl border" aria-label="Ignored lines">
              {lines.map((line) => (
                <li key={line.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {line.bankDescription ?? (line.note || "No description")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDisplayDate(line.date)} ·{" "}
                      <span className="tabular-nums">
                        {format(toShown(wallet, line.amountCents), { sign: "always" })}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="h-11 shrink-0"
                    disabled={restoring !== null}
                    onClick={() => void restore(line.id)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

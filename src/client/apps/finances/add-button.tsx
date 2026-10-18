import { CalendarPlusIcon, LandmarkIcon, PlusIcon, ReceiptTextIcon } from "lucide-react"
import { useState } from "react"
import { AddTransactionDialog } from "@/apps/finances/transactions/transaction-dialogs"
import { BalanceCheckDialog } from "@/apps/finances/wallets/balance-check-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Adding = { kind: "actual" | "planned" | "check"; open: boolean }

/**
 * The floating + button on Home and Wallet pages: Add Actual, Add one-off Planned and Enter
 * Balance check, each starting on the given Wallet, or asking for one when there is none.
 */
export function AddButton({ walletId }: { walletId?: string }) {
  // The kind is kept while a dialog closes, so it never changes as it fades.
  const [adding, setAdding] = useState<Adding>({ kind: "actual", open: false })
  const open = (kind: Adding["kind"]) => setAdding({ kind, open: true })
  const onOpenChange = (next: boolean) => setAdding((previous) => ({ ...previous, open: next }))

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon"
              className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-lg"
            />
          }
        >
          <PlusIcon className="size-6" />
          <span className="sr-only">Add</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-56">
          <DropdownMenuItem className="min-h-11" onClick={() => open("actual")}>
            <ReceiptTextIcon />
            Add Actual
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onClick={() => open("planned")}>
            <CalendarPlusIcon />
            Add one-off Planned
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onClick={() => open("check")}>
            <LandmarkIcon />
            Enter Balance check
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {adding.kind === "check" ? (
        <BalanceCheckDialog open={adding.open} onOpenChange={onOpenChange} walletId={walletId} />
      ) : (
        <AddTransactionDialog
          open={adding.open}
          onOpenChange={onOpenChange}
          status={adding.kind}
          walletId={walletId}
        />
      )}
    </>
  )
}
